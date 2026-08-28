import { allGenres } from '$lib/data';
import { listMovies } from '$lib/server/catalog';
import { withProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const items = await withProgress(locals.user!.id, await listMovies());
	return {
		items,
		genres: allGenres(items),
		initialQuery: url.searchParams.get('q') ?? ''
	};
};
