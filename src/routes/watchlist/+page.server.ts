import { allGenres } from '$lib/data';
import { withProgress } from '$lib/server/progress';
import { listWatchlist } from '$lib/server/watchlist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	// Card menus call invalidate('app:watchlist') after a toggle so a removed
	// title disappears from this grid without a full reload.
	depends('app:watchlist');
	// /watchlist is in ACCOUNT_PREFIXES (hooks.server.ts): a session is guaranteed.
	const userId = locals.user!.id;
	const items = await withProgress(userId, await listWatchlist(userId));
	return { items, genres: allGenres(items) };
};
