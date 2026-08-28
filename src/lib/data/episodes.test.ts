import { describe, expect, it } from 'vitest';
import { episodeLabel, flattenEpisodes, playTarget } from './episodes';
import type { Episode, Season, Series } from './types';

function ep(id: string, number: number, progress?: number): Episode {
	return { id, number, title: id, synopsis: '', runtimeMinutes: 40, progress };
}

function season(number: number, episodes: Episode[]): Season {
	return { number, year: 2020 + number, episodes };
}

function show(seasons: Season[], lastWatchedEpisodeId?: string): Series {
	return {
		kind: 'series',
		id: 'show',
		title: 'Show',
		synopsis: '',
		year: 2021,
		rating: 8,
		maturity: 'TV-14',
		genres: [],
		cast: [],
		hue: 0,
		hue2: 0,
		creator: '',
		seasons,
		lastWatchedEpisodeId
	} as unknown as Series;
}

const twoSeasons = (progress: Record<string, number> = {}) => [
	season(1, [ep('s1e1', 1, progress.s1e1), ep('s1e2', 2, progress.s1e2)]),
	season(2, [ep('s2e1', 1, progress.s2e1), ep('s2e2', 2, progress.s2e2)])
];

describe('flattenEpisodes', () => {
	it('keeps season/episode order and pairs each episode with its season', () => {
		const flat = flattenEpisodes(show(twoSeasons()));
		expect(flat.map(({ season, episode }) => `${season.number}:${episode.id}`)).toEqual([
			'1:s1e1',
			'1:s1e2',
			'2:s2e1',
			'2:s2e2'
		]);
	});

	it('is empty for a show without episodes', () => {
		expect(flattenEpisodes(show([]))).toEqual([]);
		expect(flattenEpisodes(show([season(1, [])]))).toEqual([]);
	});
});

describe('playTarget', () => {
	it('starts an unwatched show at the first episode', () => {
		const target = playTarget(show(twoSeasons()));
		expect(target).toMatchObject({ season: 1, resume: false });
		expect(target?.episode.id).toBe('s1e1');
		expect(episodeLabel(1, 1)).toBe('S1E1');
	});

	it('resumes the most recently watched episode when it is unfinished', () => {
		const target = playTarget(show(twoSeasons({ s1e1: 1, s1e2: 0.42 }), 's1e2'));
		expect(target).toMatchObject({ season: 1, resume: true });
		expect(target?.episode.id).toBe('s1e2');
	});

	it('moves to the next episode across a season boundary once the latest is finished', () => {
		const target = playTarget(show(twoSeasons({ s1e1: 1, s1e2: 1 }), 's1e2'));
		expect(target).toMatchObject({ season: 2, resume: true });
		expect(target?.episode.id).toBe('s2e1');
	});

	it('prefers recency over order: an abandoned early episode does not pull the viewer back', () => {
		const target = playTarget(show(twoSeasons({ s1e1: 0.3, s2e1: 1 }), 's2e1'));
		expect(target?.episode.id).toBe('s2e2');
		expect(target?.resume).toBe(true);
	});

	it('starts over when the last episode of the show is finished', () => {
		const target = playTarget(show(twoSeasons({ s2e2: 1 }), 's2e2'));
		expect(target).toMatchObject({ season: 1, resume: false });
		expect(target?.episode.id).toBe('s1e1');
	});

	it('falls back to the first episode when the remembered episode is gone', () => {
		const target = playTarget(show(twoSeasons(), 'ghost'));
		expect(target).toMatchObject({ season: 1, resume: false });
		expect(target?.episode.id).toBe('s1e1');
	});

	it('returns undefined instead of throwing for a show without episodes', () => {
		expect(playTarget(show([]))).toBeUndefined();
		expect(playTarget(show([season(1, [])], 's1e1'))).toBeUndefined();
	});
});
