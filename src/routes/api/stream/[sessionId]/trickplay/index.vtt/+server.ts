import { error, type RequestHandler } from '@sveltejs/kit';
import { sessionManager } from '$lib/server/streaming/session-manager';
import { buildTrickplayVtt } from '$lib/server/trickplay/vtt';

/**
 * The seek-bar thumbnail track for a playback session, synthesized from the
 * sprite layout the device reported at playback start. Authorization = the
 * session uuid, like every /api/stream route.
 */
export const GET: RequestHandler = ({ params }) => {
	const session = sessionManager.get(params.sessionId!);
	if (!session) error(404, 'no such playback session');
	sessionManager.touch(session.id);
	const { file } = session.source;
	if (!session.trickplay || !file.durationMs) error(404, 'no thumbnails for this session');
	return new Response(buildTrickplayVtt(session.trickplay, file.durationMs), {
		headers: {
			'content-type': 'text/vtt; charset=utf-8',
			'cache-control': 'private, max-age=3600'
		}
	});
};
