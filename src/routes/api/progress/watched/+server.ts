import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { markWatched } from '$lib/server/progress';
import { requireProfile } from '$lib/server/profiles';

// Series are marked one episode at a time; there is no whole-series shortcut.
const WatchedRequest = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('movie'), slug: z.string().min(1) }),
	z.object({ kind: z.literal('series'), slug: z.string().min(1), episodeSlug: z.string().min(1) })
]);

/** Mark a movie, or one episode of a series, as fully watched (one-way). */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to mark titles as watched.');
	const profile = requireProfile(locals);
	const parsed = WatchedRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success)
		error(400, 'expected { kind: "movie", slug } or { kind: "series", slug, episodeSlug }');
	const found = await markWatched(profile.id, parsed.data);
	if (!found) error(404, 'Title not found');
	return json({ ok: true });
};
