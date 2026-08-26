import { allGenres, byGenre } from '$lib/data';
import { listAllItems } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const items = await listAllItems();
	return {
		categories: allGenres(items).map((genre) => ({ genre, items: byGenre(genre, items) }))
	};
};
