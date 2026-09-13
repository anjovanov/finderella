import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { registry } from '$lib/server/gateways/registry';
import { SEGMENT_SECONDS } from '$lib/server/streaming/hls-playlist';
import { sessionManager, type HotSession } from '$lib/server/streaming/session-manager';
import { listSubtitleTracks } from '$lib/server/streaming/subtitles';
import type { PlayableSource } from '$lib/server/streaming/source-picker';
import {
	canTrickplay,
	ensureTrickplay,
	trickplayVttSrc,
	usableGeometry
} from '$lib/server/trickplay/ensure';
import { loginRequired, trickplayEnabled } from '$lib/server/site-settings';
import { pickEpisodeSource, pickMovieSource } from '$lib/server/streaming/source-picker';
import { QUALITY_IDS, QUALITY_LADDER, transcodePlan } from '$lib/playback-quality';

/**
 * Playback start must not wait on thumbnails: the device answers from its
 * cache in milliseconds, or from one ffprobe when it has to start a job; a
 * cold NAS that takes longer than this only costs that session its previews.
 */
const TRICKPLAY_ENSURE_TIMEOUT_MS = 2_000;

/**
 * Kick off (or look up) the file's sprite sheets on its device and remember
 * the layout on the session so /api/stream/<id>/trickplay/* can serve them.
 * Null = no thumbnails for this session (switched off, old gateway, no duration, timeout).
 */
async function attachTrickplay(
	session: HotSession,
	source: PlayableSource
): Promise<{ vttSrc: string } | null> {
	if (!(await trickplayEnabled())) return null;
	if (!canTrickplay(registry.get(source.gatewayId), source.file)) return null;
	const geometry = usableGeometry(
		await ensureTrickplay(source, 'high', TRICKPLAY_ENSURE_TIMEOUT_MS)
	);
	if (!geometry) return null;
	sessionManager.setTrickplay(session.id, geometry);
	return { vttSrc: trickplayVttSrc(session.id) };
}

const StartRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	episodeSlug: z.string().min(1).optional(),
	startSeconds: z.number().nonnegative().default(0),
	quality: z.enum(QUALITY_IDS).default('original')
});

/**
 * Create a playback session for a title and return what the player should
 * load. Modes:
 *  - direct: browser-compatible file on an online gateway → range proxy
 *  - hls:    anything else → ffmpeg on the gateway, hub-synthesized playlists
 * An explicit `quality` rung forces hls, capped to that rung (see
 * $lib/playback-quality) — the way to fit a remote gateway's uplink.
 * Error bodies are shown verbatim by the watch pages, so keep them readable.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user ?? null;
	// hooks.server.ts already answers 401 when an account is required; this is
	// the defensive check for guest mode being switched off mid-session.
	if (!user && (await loginRequired())) error(401, 'Sign in to watch.');
	const viewerId = user?.id ?? null;
	const parsed = StartRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug, episodeSlug? }');
	const { kind, slug, episodeSlug, startSeconds, quality } = parsed.data;
	const rung = quality === 'original' ? undefined : QUALITY_LADDER[quality];
	if (kind === 'series' && !episodeSlug) error(400, 'episodeSlug required for series');

	const lookup =
		kind === 'movie' ? await pickMovieSource(slug) : await pickEpisodeSource(slug, episodeSlug!);
	if (!lookup.source) {
		if (lookup.reason === 'offline') {
			error(503, 'The device holding this title is offline right now.');
		}
		error(
			404,
			'No media file is linked to this title. Add it to a library on a device and rescan.'
		);
	}
	const source = lookup.source;

	if (source.directPlayable && !rung) {
		const session = await sessionManager.start(viewerId, source, 'direct', quality);
		const [subtitles, trickplay] = await Promise.all([
			listSubtitleTracks(source.file.id, session.id),
			attachTrickplay(session, source)
		]);
		return json({
			mode: 'direct',
			src: `/api/stream/${session.id}/file`,
			sessionId: session.id,
			quality,
			source: { width: source.file.width, height: source.file.height },
			subtitles,
			trickplay
		});
	}

	// HLS transcode path: ffmpeg runs on the gateway that owns the file.
	const connected = registry.get(source.gatewayId);
	if (!connected?.capabilities.ffmpeg) {
		error(
			501,
			`"${source.file.relPath}" needs transcoding, but the device holding it has no ffmpeg`
		);
	}
	if (!source.file.durationMs) {
		error(
			501,
			`"${source.file.relPath}" needs transcoding, but was scanned without ffprobe (no duration) — install ffprobe on the device and rescan`
		);
	}

	const session = await sessionManager.start(viewerId, source, 'hls', quality);
	const plan = transcodePlan(quality, source.file.width);
	// In flight alongside session.start; never awaited before the transcode is up.
	const trickplayPending = attachTrickplay(session, source);
	try {
		await registry.request(
			source.gatewayId,
			{
				type: 'session.start',
				sessionId: session.id,
				rootPath: source.rootPath,
				relPath: source.file.relPath,
				startSeconds,
				segmentSeconds: SEGMENT_SECONDS,
				durationMs: source.file.durationMs,
				quality: {
					maxWidth: plan.maxWidth,
					maxVideoKbps: plan.maxVideoKbps,
					audioKbps: plan.audioKbps,
					level: plan.level
				}
			},
			{ timeoutMs: 15_000 }
		);
	} catch (err) {
		await sessionManager.stop(session.id, 'error');
		error(502, `device failed to start transcoding: ${(err as Error).message}`);
	}
	const [subtitles, trickplay] = await Promise.all([
		listSubtitleTracks(source.file.id, session.id),
		trickplayPending
	]);
	return json({
		mode: 'hls',
		src: `/api/stream/${session.id}/hls/master.m3u8`,
		sessionId: session.id,
		quality,
		source: { width: source.file.width, height: source.file.height },
		subtitles,
		trickplay
	});
};
