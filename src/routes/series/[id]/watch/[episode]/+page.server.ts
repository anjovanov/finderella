import { error } from '@sveltejs/kit';
import { getSeriesBySlug } from '$lib/server/catalog';
import { episodeResumePosition, withProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const show = await getSeriesBySlug(params.id);
	if (!show) error(404, 'Series not found');
	// The player's "More episodes" panel renders EpisodeCards from this `show`,
	// so it needs the per-episode progress like the detail page does.
	await withProgress(locals.user!.id, [show]);

	const flat = show.seasons.flatMap((season) =>
		season.episodes.map((episode) => ({ season, episode }))
	);
	const index = flat.findIndex(({ episode }) => episode.id === params.episode);
	if (index === -1) error(404, 'Episode not found');

	const { season, episode } = flat[index];
	const resumeFrom = (await episodeResumePosition(locals.user!.id, params.id, episode.id)) ?? 0;
	return {
		show,
		season,
		episode,
		resumeFrom,
		// Playback source comes from POST /api/playback/start (client-side).
		nextEpisodeId: flat[index + 1]?.episode.id
	};
};
