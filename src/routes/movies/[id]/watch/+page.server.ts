import { error } from '@sveltejs/kit';
import { getMovieBySlug } from '$lib/server/catalog';
import { movieResumePosition } from '$lib/server/progress';
import { getPlaybackSettings, getSubtitleSettings } from '$lib/server/profile-settings';
import { subtitleProvidersConfigured } from '$lib/server/subtitles/settings';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieBySlug(params.id);
	if (!movie) error(404, 'Movie not found');
	const profileId = viewerProfileId(locals);
	const [resumeFrom, subtitleSettings, playbackSettings, providersConfigured] = await Promise.all([
		movieResumePosition(profileId, params.id).then((position) => position ?? 0),
		getSubtitleSettings(profileId),
		getPlaybackSettings(profileId),
		subtitleProvidersConfigured()
	]);
	// Playback source comes from POST /api/playback/start (client-side).
	return {
		movie,
		resumeFrom,
		subtitleSettings,
		// The profile's preferred audio language; null = guest (the page uses this browser's).
		audioLanguage: profileId ? playbackSettings.audioLanguage : null,
		// Autoplay + "Still watching?" for profiles; null = guest (defaults, autoplay per browser).
		playbackSettings: profileId ? playbackSettings : null,
		canFindSubtitles: profileId !== null && providersConfigured
	};
};
