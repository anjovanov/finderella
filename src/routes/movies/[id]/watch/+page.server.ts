import { error } from '@sveltejs/kit';
import { getMovieBySlug } from '$lib/server/catalog';
import { movieResumePosition, withProgress } from '$lib/server/progress';
import { getPlaybackSettings, getSubtitleSettings } from '$lib/server/profile-settings';
import { subtitleProvidersConfigured } from '$lib/server/subtitles/settings';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';
import { moreLikeThis, resolveRecommended } from '$lib/server/recommendations';
import type { Movie } from '$lib/data/types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const movie = await getMovieBySlug(params.id);
	if (!movie) error(404, 'Movie not found');
	const profileId = viewerProfileId(locals);
	const [resumeFrom, subtitleSettings, playbackSettings, providersConfigured, similar] =
		await Promise.all([
			movieResumePosition(profileId, params.id).then((position) => position ?? 0),
			getSubtitleSettings(profileId),
			getPlaybackSettings(profileId),
			subtitleProvidersConfigured(),
			// The player's "More like this" sheet: movies only (its cards open the watch page).
			moreLikeThis('movie', params.id, { kinds: ['movie'] })
				.then(resolveRecommended)
				.then((items) =>
					withProgress(
						profileId,
						items.filter((i): i is Movie => i.kind === 'movie')
					)
				)
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
		canFindSubtitles: profileId !== null && providersConfigured,
		// Watch parties are for accounts with a profile.
		canWatchTogether: profileId !== null,
		similar
	};
};
