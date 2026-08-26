import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { sessionManager } from '$lib/server/streaming/session-manager';

const StopRequest = z.object({ sessionId: z.string().uuid() });

/** Stop a playback session (player teardown; also hit via sendBeacon on pagehide). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401);
	const parsed = StopRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { sessionId }');
	const session = sessionManager.get(parsed.data.sessionId);
	if (session && session.userId === user.id) {
		await sessionManager.stop(session.id, 'client');
	}
	return json({ ok: true });
};
