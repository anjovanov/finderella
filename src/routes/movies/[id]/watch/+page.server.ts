import { error } from '@sveltejs/kit';
import { getMovieBySlug } from '$lib/server/catalog';
import { movieResumePosition } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieBySlug(params.id);
	if (!movie) error(404, 'Movie not found');
	const resumeFrom = (await movieResumePosition(locals.user!.id, params.id)) ?? 0;
	// Playback source comes from POST /api/playback/start (client-side).
	return { movie, resumeFrom };
};
