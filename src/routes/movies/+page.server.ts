import { allGenres } from '$lib/data';
import { listMovies } from '$lib/server/catalog';
import { withProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';

export const load: PageServerLoad = async ({ locals }) => {
	const items = await withProgress(viewerProfileId(locals), await listMovies());
	return { items, genres: allGenres(items) };
};
