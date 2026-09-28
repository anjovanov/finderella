import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { toggleWatchlist } from '$lib/server/watchlist';
import { requireProfile } from '$lib/server/profiles';

const WatchlistRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	inWatchlist: z.boolean()
});

/** Save / unsave a title for the viewer's active profile. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to use your watchlist.');
	const profile = requireProfile(locals);
	const parsed = WatchlistRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug, inWatchlist }');
	const { kind, slug, inWatchlist } = parsed.data;
	const found = await toggleWatchlist(profile.id, kind, slug, inWatchlist);
	if (!found) error(404, 'Title not found');
	return json({ ok: true, inWatchlist });
};
