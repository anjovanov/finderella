import { error } from '@sveltejs/kit';
import { flattenEpisodes } from '$lib/data';
import { getSeriesBySlug } from '$lib/server/catalog';
import { episodeResumePosition, withProgress } from '$lib/server/progress';
import { getPlaybackSettings, getSubtitleSettings } from '$lib/server/user-settings';
import { subtitleProvidersConfigured } from '$lib/server/subtitles/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const show = await getSeriesBySlug(params.id);
	if (!show) error(404, 'Series not found');
	// The player's "More episodes" panel renders EpisodeCards from this `show`,
	// so it needs the per-episode progress like the detail page does.
	await withProgress(locals.user?.id ?? null, [show]);

	const flat = flattenEpisodes(show);
	const index = flat.findIndex(({ episode }) => episode.id === params.episode);
	if (index === -1) error(404, 'Episode not found');

	const { season, episode } = flat[index];
	const userId = locals.user?.id ?? null;
	const [resumeFrom, subtitleSettings, playbackSettings, providersConfigured] = await Promise.all([
		episodeResumePosition(userId, params.id, episode.id).then((position) => position ?? 0),
		getSubtitleSettings(userId),
		getPlaybackSettings(userId),
		subtitleProvidersConfigured()
	]);
	return {
		show,
		season,
		episode,
		resumeFrom,
		subtitleSettings,
		// The account's preferred audio language; null = guest (the page uses this browser's).
		audioLanguage: userId ? playbackSettings.audioLanguage : null,
		canFindSubtitles: userId !== null && providersConfigured,
		// Playback source comes from POST /api/playback/start (client-side).
		nextEpisodeId: flat[index + 1]?.episode.id
	};
};
