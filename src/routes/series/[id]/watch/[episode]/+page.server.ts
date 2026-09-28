import { error } from '@sveltejs/kit';
import { flattenEpisodes } from '$lib/data';
import { getSeriesBySlug } from '$lib/server/catalog';
import { episodeResumePosition, withProgress } from '$lib/server/progress';
import { getPlaybackSettings, getSubtitleSettings } from '$lib/server/profile-settings';
import { subtitleProvidersConfigured } from '$lib/server/subtitles/settings';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';

export const load: PageServerLoad = async ({ params, locals }) => {
	const show = await getSeriesBySlug(params.id);
	if (!show) error(404, 'Series not found');
	// The player's "More episodes" panel renders EpisodeCards from this `show`,
	// so it needs the per-episode progress like the detail page does.
	await withProgress(viewerProfileId(locals), [show]);

	const flat = flattenEpisodes(show);
	const index = flat.findIndex(({ episode }) => episode.id === params.episode);
	if (index === -1) error(404, 'Episode not found');

	const { season, episode } = flat[index];
	const profileId = viewerProfileId(locals);
	const [resumeFrom, subtitleSettings, playbackSettings, providersConfigured] = await Promise.all([
		episodeResumePosition(profileId, params.id, episode.id).then((position) => position ?? 0),
		getSubtitleSettings(profileId),
		getPlaybackSettings(profileId),
		subtitleProvidersConfigured()
	]);
	return {
		show,
		season,
		episode,
		resumeFrom,
		subtitleSettings,
		// The profile's preferred audio language; null = guest (the page uses this browser's).
		audioLanguage: profileId ? playbackSettings.audioLanguage : null,
		// Autoplay + "Still watching?" for profiles; null = guest (defaults, autoplay per browser).
		playbackSettings: profileId ? playbackSettings : null,
		canFindSubtitles: profileId !== null && providersConfigured,
		// Playback source comes from POST /api/playback/start (client-side).
		nextEpisodeId: flat[index + 1]?.episode.id
	};
};
