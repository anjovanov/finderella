import { allGenres } from '$lib/data';
import { listMovies } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const items = await listMovies();
	return {
		items,
		genres: allGenres(items),
		initialQuery: url.searchParams.get('q') ?? ''
	};
};
