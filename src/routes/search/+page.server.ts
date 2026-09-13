import type { MediaItem } from '$lib/data';
import { getMoviesBySlugs, getSeriesBySlugs } from '$lib/server/catalog';
import { withProgress } from '$lib/server/progress';
import { searchCatalog } from '$lib/server/search';
import type { PageServerLoad } from './$types';

const MAX_RESULTS = 60;

/**
 * Full results for the navbar's "See all" / Enter. Ranked slugs come from the
 * in-memory index; the rows are hydrated afterwards so the grid gets complete
 * MediaItems (progress + watchlist overlay like every library page). The
 * `inArray` lookups return DB order, so the hit order is re-applied here.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) return { q, items: [] as MediaItem[] };
	const hits = await searchCatalog(q, MAX_RESULTS);
	const [movies, shows] = await Promise.all([
		getMoviesBySlugs(hits.filter((h) => h.kind === 'movie').map((h) => h.id)),
		getSeriesBySlugs(hits.filter((h) => h.kind === 'series').map((h) => h.id))
	]);
	const byKey = new Map<string, MediaItem>(
		[...movies, ...shows].map((item) => [`${item.kind}:${item.id}`, item])
	);
	// A title pruned since the last index rebuild simply drops out.
	const items = hits.flatMap((h) => byKey.get(`${h.kind}:${h.id}`) ?? []);
	return { q, items: await withProgress(locals.user?.id ?? null, items) };
};
