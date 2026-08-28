import { error } from '@sveltejs/kit';
import { byGenre } from '$lib/data';
import { getMovieBySlug, listAllItems } from '$lib/server/catalog';
import { applyProgress, loadProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieBySlug(params.id);
	if (!movie) error(404, 'Movie not found');
	const related =
		movie.genres.length > 0
			? byGenre(movie.genres[0], await listAllItems()).filter((i) => i.id !== movie.id)
			: [];
	const progress = await loadProgress(locals.user!.id);
	applyProgress([movie, ...related], progress);
	return { movie, related };
};
