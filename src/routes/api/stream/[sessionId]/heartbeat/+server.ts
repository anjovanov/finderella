import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { sessionManager } from '$lib/server/streaming/session-manager';
import { markSeen } from '$lib/server/stats/seen';

const Beat = z.object({
	state: z.enum(['playing', 'paused', 'buffering', 'unknown']),
	positionSeconds: z.number().nonnegative(),
	durationSeconds: z.number().positive().nullable(),
	subtitleTrackId: z.string().min(1).nullish()
});

/**
 * Player heartbeat (every 10 s and on play/pause/buffering changes). Like the
 * other /api/stream routes it is authorized by the session uuid alone, so it
 * skips the Better Auth lookup. 410 = an admin stopped the stream; the body's
 * message is shown to the viewer.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const session = sessionManager.get(params.sessionId!);
	if (!session) error(404, 'no such playback session');
	if (session.terminateMessage) {
		const message = session.terminateMessage;
		await sessionManager.stop(session.id, 'admin');
		return json({ message }, { status: 410 });
	}
	const parsed = Beat.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { state, positionSeconds, durationSeconds }');
	sessionManager.heartbeat(session.id, parsed.data);
	if (session.userId) markSeen(session.userId, session.userAgent);
	return json({ ok: true });
};
