import { error } from '@sveltejs/kit';
import { getMovieBySlug } from '$lib/server/catalog';
import { movieResumePosition } from '$lib/server/progress';
import { getSubtitleSettings } from '$lib/server/user-settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieBySlug(params.id);
	if (!movie) error(404, 'Movie not found');
	const userId = locals.user?.id ?? null;
	const [resumeFrom, subtitleSettings] = await Promise.all([
		movieResumePosition(userId, params.id).then((position) => position ?? 0),
		getSubtitleSettings(userId)
	]);
	// Playback source comes from POST /api/playback/start (client-side).
	return { movie, resumeFrom, subtitleSettings };
};
