import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { markWatched } from '$lib/server/progress';

const WatchedRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1)
});

/** Mark a movie, or every episode of a series, as fully watched (one-way). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401, 'Sign in to mark titles as watched.');
	const parsed = WatchedRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug }');
	const found = await markWatched(user.id, parsed.data.kind, parsed.data.slug);
	if (!found) error(404, 'Title not found');
	return json({ ok: true });
};
