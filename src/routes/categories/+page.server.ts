import { allGenres, byGenre } from '$lib/data';
import { listAllItems } from '$lib/server/catalog';
import { withProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const items = await withProgress(locals.user!.id, await listAllItems());
	return {
		categories: allGenres(items).map((genre) => ({ genre, items: byGenre(genre, items) }))
	};
};
