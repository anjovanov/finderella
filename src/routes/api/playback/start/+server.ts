import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { registry } from '$lib/server/gateways/registry';
import { SEGMENT_SECONDS } from '$lib/server/streaming/hls-playlist';
import { sessionManager } from '$lib/server/streaming/session-manager';
import { pickEpisodeSource, pickMovieSource } from '$lib/server/streaming/source-picker';
import { QUALITY_IDS, QUALITY_LADDER, transcodePlan } from '$lib/playback-quality';

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
	const user = locals.user;
	if (!user) error(401);
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
		const session = await sessionManager.start(user.id, source, 'direct', quality);
		return json({
			mode: 'direct',
			src: `/api/stream/${session.id}/file`,
			sessionId: session.id,
			quality,
			source: { width: source.file.width, height: source.file.height }
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

	const session = await sessionManager.start(user.id, source, 'hls', quality);
	const plan = transcodePlan(quality, source.file.width);
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
	return json({
		mode: 'hls',
		src: `/api/stream/${session.id}/hls/master.m3u8`,
		sessionId: session.id,
		quality,
		source: { width: source.file.width, height: source.file.height }
	});
};
