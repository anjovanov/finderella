import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { toggleWatchlist } from '$lib/server/watchlist';

const WatchlistRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	inWatchlist: z.boolean()
});

/** Save / unsave a title for the signed-in viewer. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401, 'Sign in to use your watchlist.');
	const parsed = WatchlistRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug, inWatchlist }');
	const { kind, slug, inWatchlist } = parsed.data;
	const found = await toggleWatchlist(user.id, kind, slug, inWatchlist);
	if (!found) error(404, 'Title not found');
	return json({ ok: true, inWatchlist });
};
