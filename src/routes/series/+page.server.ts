import { allGenres } from '$lib/data';
import { listSeries } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const items = await listSeries();
	return {
		items,
		genres: allGenres(items),
		initialQuery: url.searchParams.get('q') ?? ''
	};
};
