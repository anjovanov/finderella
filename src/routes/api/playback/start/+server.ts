import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getVideoSrc } from '$lib/data/playback';
import { registry } from '$lib/server/gateways/registry';
import { SEGMENT_SECONDS } from '$lib/server/streaming/hls-playlist';
import { sessionManager } from '$lib/server/streaming/session-manager';
import { pickEpisodeSource, pickMovieSource } from '$lib/server/streaming/source-picker';

const StartRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	episodeSlug: z.string().min(1).optional(),
	startSeconds: z.number().nonnegative().default(0)
});

/**
 * Create a playback session for a title and return what the player should
 * load. Modes:
 *  - direct: real file on an online gateway, browser-compatible → range proxy
 *  - demo:   no real source (seeded catalog / gateway offline with no alternative)
 *            → sample video, so the UI stays usable without media
 * HLS transcoding for non-direct-playable files arrives in Phase 3.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401);
	const parsed = StartRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug, episodeSlug? }');
	const { kind, slug, episodeSlug, startSeconds } = parsed.data;
	if (kind === 'series' && !episodeSlug) error(400, 'episodeSlug required for series');

	const source =
		kind === 'movie' ? await pickMovieSource(slug) : await pickEpisodeSource(slug, episodeSlug!);

	if (!source) {
		// No file on any online gateway — fall back to the demo sample so seeded
		// titles remain playable in development.
		return json({ mode: 'demo', src: getVideoSrc(episodeSlug ?? slug), sessionId: null });
	}

	if (source.directPlayable) {
		const session = await sessionManager.start(user.id, source, 'direct');
		return json({ mode: 'direct', src: `/api/stream/${session.id}/file`, sessionId: session.id });
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

	const session = await sessionManager.start(user.id, source, 'hls');
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
				durationMs: source.file.durationMs
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
		sessionId: session.id
	});
};
