import { error } from '@sveltejs/kit';
import { getMovieBySlug } from '$lib/server/catalog';
import { movieResumePosition } from '$lib/server/progress';
import { getPlaybackSettings, getSubtitleSettings } from '$lib/server/user-settings';
import { subtitleProvidersConfigured } from '$lib/server/subtitles/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieBySlug(params.id);
	if (!movie) error(404, 'Movie not found');
	const userId = locals.user?.id ?? null;
	const [resumeFrom, subtitleSettings, playbackSettings, providersConfigured] = await Promise.all([
		movieResumePosition(userId, params.id).then((position) => position ?? 0),
		getSubtitleSettings(userId),
		getPlaybackSettings(userId),
		subtitleProvidersConfigured()
	]);
	// Playback source comes from POST /api/playback/start (client-side).
	return {
		movie,
		resumeFrom,
		subtitleSettings,
		// The account's preferred audio language; null = guest (the page uses this browser's).
		audioLanguage: userId ? playbackSettings.audioLanguage : null,
		// Autoplay + "Still watching?" for accounts; null = guest (defaults, autoplay per browser).
		playbackSettings: userId ? playbackSettings : null,
		canFindSubtitles: userId !== null && providersConfigured
	};
};
