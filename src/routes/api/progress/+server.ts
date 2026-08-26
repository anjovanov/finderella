import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { saveProgress } from '$lib/server/progress';

const ProgressRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	episodeSlug: z.string().min(1).optional(),
	positionSeconds: z.number().nonnegative().finite(),
	durationSeconds: z.number().positive().finite()
});

/** Watch-position updates: throttled POSTs from the player + a pagehide beacon. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401);
	const parsed = ProgressRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'invalid progress payload');
	const saved = await saveProgress({ userId: user.id, ...parsed.data });
	return json({ ok: saved });
};
