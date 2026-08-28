import type { Episode, Season, Series } from './types';

/**
 * Pure episode-ordering helpers shared by the watch loader and the Play/Resume
 * button. Imports only types so they run in vitest without SvelteKit mocks.
 */

export interface FlatEpisode {
	season: Season;
	episode: Episode;
}

/** Every episode in season/episode order, paired with its season. */
export function flattenEpisodes(show: Series): FlatEpisode[] {
	return show.seasons.flatMap((season) => season.episodes.map((episode) => ({ season, episode })));
}

export interface PlayTarget {
	season: number;
	episode: Episode;
	/** `true` → label "Resume SxEy"; `false` → a fresh "Play" from the first episode. */
	resume: boolean;
}

/**
 * The viewer's next-in-line episode: resume the most recently watched episode
 * when it is unfinished, otherwise the one right after it. Unwatched shows and
 * shows whose last episode is finished start over at the first episode.
 * `undefined` when the show has no episodes.
 */
export function playTarget(show: Series): PlayTarget | undefined {
	const flat = flattenEpisodes(show);
	if (flat.length === 0) return undefined;
	const fresh: PlayTarget = {
		season: flat[0].season.number,
		episode: flat[0].episode,
		resume: false
	};
	if (!show.lastWatchedEpisodeId) return fresh;
	const index = flat.findIndex(({ episode }) => episode.id === show.lastWatchedEpisodeId);
	if (index === -1) return fresh;
	const latest = flat[index];
	const fraction = latest.episode.progress;
	if (fraction !== undefined && fraction < 1) {
		return { season: latest.season.number, episode: latest.episode, resume: true };
	}
	const next = flat[index + 1];
	return next ? { season: next.season.number, episode: next.episode, resume: true } : fresh;
}

/** "S2E4" — the same shape EpisodeCard prints. */
export function episodeLabel(season: number, episodeNumber: number): string {
	return `S${season}E${episodeNumber}`;
}
