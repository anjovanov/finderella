import { error, type RequestHandler } from '@sveltejs/kit';
import { registry } from '$lib/server/gateways/registry';
import { buildMasterPlaylist, buildMediaPlaylist } from '$lib/server/streaming/hls-playlist';
import { sessionManager } from '$lib/server/streaming/session-manager';

const SEGMENT_RE = /^seg-\d+\.m4s$/;

/**
 * HLS delivery for transcode sessions. Playlists are synthesized hub-side
 * from the file's probed duration; init/segments are pulled from the gateway
 * over the tunnel (which transparently restarts ffmpeg on out-of-window
 * seeks). Authorization = the unguessable session uuid, like /file.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const session = sessionManager.get(params.sessionId!);
	if (!session || session.mode !== 'hls') error(404, 'no such playback session');
	sessionManager.touch(session.id);

	const asset = params.asset!;
	const { file, gatewayId } = session.source;

	if (asset === 'master.m3u8') {
		return new Response(buildMasterPlaylist(file.bitrate), {
			headers: { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' }
		});
	}
	if (asset === 'media.m3u8') {
		if (!file.durationMs) error(500, 'file has no probed duration');
		return new Response(buildMediaPlaylist(file.durationMs), {
			headers: { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' }
		});
	}
	if (asset !== 'init.mp4' && !SEGMENT_RE.test(asset)) error(404, 'unknown asset');

	let body: ReadableStream<Uint8Array>;
	try {
		body = registry.openByteStream(
			gatewayId,
			{ type: 'hls.get', sessionId: session.id, name: asset },
			request.signal
		);
	} catch {
		error(502, 'device is offline');
	}
	return new Response(body, {
		headers: {
			'content-type': asset === 'init.mp4' ? 'video/mp4' : 'video/iso.segment',
			'cache-control': 'no-store'
		}
	});
};
