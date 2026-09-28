import { error } from '@sveltejs/kit';
import { byGenre } from '$lib/data';
import { getMovieDetail, listAllItems } from '$lib/server/catalog';
import { applyProgress, loadProgress, movieWatchState } from '$lib/server/progress';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieDetail(params.id);
	if (!movie) error(404, 'Movie not found');
	const related =
		movie.genres.length > 0
			? byGenre(movie.genres[0], await listAllItems()).filter((i) => i.id !== movie.id)
			: [];
	const profileId = viewerProfileId(locals);
	const [progress, resume] = await Promise.all([
		loadProgress(profileId),
		// Exact position for "Resume at 15m 25s" + the progress line under the poster.
		movieWatchState(profileId, params.id)
	]);
	applyProgress([movie, ...related], progress);
	return { movie, related, resume };
};
