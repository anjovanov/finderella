import { error } from '@sveltejs/kit';
import { byGenre } from '$lib/data';
import { getMovieDetail, listAllItems } from '$lib/server/catalog';
import { applyProgress, loadProgress, movieWatchState } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieDetail(params.id);
	if (!movie) error(404, 'Movie not found');
	const related =
		movie.genres.length > 0
			? byGenre(movie.genres[0], await listAllItems()).filter((i) => i.id !== movie.id)
			: [];
	const userId = locals.user?.id ?? null;
	const [progress, resume] = await Promise.all([
		loadProgress(userId),
		// Exact position for "Resume at 15m 25s" + the progress line under the poster.
		movieWatchState(userId, params.id)
	]);
	applyProgress([movie, ...related], progress);
	return { movie, related, resume };
};
