import { allGenres } from '$lib/data';
import { withProgress } from '$lib/server/progress';
import { listWatchlist } from '$lib/server/watchlist';
import type { PageServerLoad } from './$types';
import { requireProfile } from '$lib/server/profiles';

export const load: PageServerLoad = async ({ locals, depends }) => {
	// Card menus call invalidate('app:watchlist') after a toggle so a removed
	// title disappears from this grid without a full reload.
	depends('app:watchlist');
	// /watchlist is in ACCOUNT_PREFIXES and behind the profile picker
	// (hooks.server.ts): a session with an active profile is guaranteed.
	const profileId = requireProfile(locals).id;
	const items = await withProgress(profileId, await listWatchlist(profileId));
	return { items, genres: allGenres(items) };
};
