import { allGenres } from '$lib/data';
import { listSeries } from '$lib/server/catalog';
import { withProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const items = await withProgress(locals.user?.id ?? null, await listSeries());
	return { items, genres: allGenres(items) };
};
