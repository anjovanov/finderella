import { describe, expect, it } from 'vitest';
import {
	ABANDON_AFTER_DAYS,
	becauseYouWatched,
	buildModel,
	CROSS_KIND_FACTOR,
	diversify,
	interactionWeight,
	jitter,
	MAX_PER_COLLECTION,
	moreLikeThis,
	popularPicks,
	recommendFor,
	similarity,
	SIGNAL_HALF_LIFE_DAYS,
	SIGNAL_WEIGHTS,
	trending,
	type RecItem,
	type WatchSignal
} from './engine';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 14);

function item(key: string, over: Partial<RecItem> = {}): RecItem {
	return {
		key,
		id: `id-${key}`,
		kind: key.startsWith('s:') ? 'series' : 'movie',
		tmdbId: null,
		genres: [],
		keywords: [],
		people: [],
		makers: [],
		studios: [],
		collectionId: null,
		language: 'en',
		year: 2020,
		rating: 7,
		voteCount: 1000,
		popularity: 10,
		addedAt: NOW - 365 * DAY,
		recommends: [],
		...over
	};
}

/** Filler titles so IDF has a library to measure against. */
function filler(n: number, over: Partial<RecItem> = {}): RecItem[] {
	return Array.from({ length: n }, (_, i) => item(`m:filler-${i}`, over));
}

const finished = (key: string, daysAgo = 1): WatchSignal => ({
	key,
	watched: { fraction: 1, at: NOW - daysAgo * DAY }
});

describe('similarity', () => {
	it('ranks a TMDB-recommended title above a genre-only match', () => {
		const model = buildModel([
			item('m:target', { tmdbId: 1, genres: ['Drama'], recommends: [2] }),
			item('m:linked', { tmdbId: 2 }),
			item('m:genre', { tmdbId: 3, genres: ['Drama'] })
		]);
		expect(moreLikeThis(model, 'm:target')).toEqual(['m:linked', 'm:genre']);
	});

	it('links both ways and weighs TMDB links by rank', () => {
		const model = buildModel([
			item('m:a', { tmdbId: 1, recommends: [2, 3] }),
			item('m:b', { tmdbId: 2 }),
			item('m:c', { tmdbId: 3 })
		]);
		const [a, b, c] = model.items;
		expect(similarity(model, b, a)).toBe(similarity(model, a, b));
		expect(similarity(model, a, b)).toBeGreaterThan(similarity(model, a, c));
	});

	it('never links titles of different kinds by TMDB id', () => {
		const model = buildModel([
			item('m:a', { tmdbId: 1, recommends: [2] }),
			item('s:b', { tmdbId: 2 })
		]);
		expect(similarity(model, model.items[0], model.items[1])).toBe(0);
	});

	it('counts a rare shared keyword more than a common one', () => {
		const model = buildModel([
			item('m:target', { keywords: [1, 2] }),
			item('m:rare', { keywords: [1, 9] }),
			item('m:common', { keywords: [2, 8] }),
			...filler(20, { keywords: [2] })
		]);
		const [target, rare, common] = model.items;
		expect(similarity(model, target, rare)).toBeGreaterThan(similarity(model, target, common));
	});

	it('ranks collection siblings first and matches any shared director', () => {
		const model = buildModel([
			item('m:target', { collectionId: 42, makers: ['Lana', 'Lilly'], genres: ['Action'] }),
			item('m:sequel', { collectionId: 42 }),
			item('m:director', { makers: ['Lilly'] }),
			item('m:genre', { genres: ['Action', 'Drama'] })
		]);
		expect(moreLikeThis(model, 'm:target')).toEqual(['m:sequel', 'm:director', 'm:genre']);
	});

	it('discounts the other kind and can filter by kind', () => {
		const model = buildModel([
			item('m:target', { genres: ['Drama'] }),
			item('m:movie', { genres: ['Drama'] }),
			item('s:show', { genres: ['Drama'] })
		]);
		const [target, movie, show] = model.items;
		expect(similarity(model, target, show)).toBeCloseTo(
			similarity(model, target, movie) * CROSS_KIND_FACTOR
		);
		expect(moreLikeThis(model, 'm:target')).toEqual(['m:movie', 's:show']);
		expect(moreLikeThis(model, 'm:target', { kinds: ['movie'] })).toEqual(['m:movie']);
	});

	it('filters by kind before keeping the top neighbours', () => {
		const model = buildModel([
			item('m:target', { genres: ['Drama'], keywords: [1] }),
			// More similar series than the neighbour cut keeps…
			...Array.from({ length: 70 }, (_, n) =>
				item(`s:show-${n}`, { genres: ['Drama'], keywords: [1] })
			),
			// …and one movie sharing only the genre.
			item('m:movie', { genres: ['Drama'] })
		]);
		expect(moreLikeThis(model, 'm:target', { kinds: ['movie'] })).toEqual(['m:movie']);
	});

	it('only rewards a shared non-English language', () => {
		const model = buildModel([
			item('m:a', { language: 'ja' }),
			item('m:b', { language: 'ja' }),
			item('m:c', { language: 'en' }),
			item('m:d', { language: 'en' })
		]);
		const [a, b, c, d] = model.items;
		expect(similarity(model, a, b)).toBeGreaterThan(0);
		expect(similarity(model, c, d)).toBe(0);
	});

	it('leaves out titles sharing nothing and unknown keys', () => {
		const model = buildModel([item('m:a', { genres: ['Drama'] }), item('m:b')]);
		expect(moreLikeThis(model, 'm:a')).toEqual([]);
		expect(moreLikeThis(model, 'm:missing')).toEqual([]);
	});

	it('breaks ties by quality', () => {
		const model = buildModel([
			item('m:target', { genres: ['Drama'] }),
			item('m:weak', { genres: ['Drama'], rating: 5 }),
			item('m:strong', { genres: ['Drama'], rating: 9 })
		]);
		expect(moreLikeThis(model, 'm:target')).toEqual(['m:strong', 'm:weak']);
	});
});

describe('interactionWeight', () => {
	const model = buildModel([item('m:movie'), item('s:show')]);

	it('weighs finished, in-progress and watchlisted titles', () => {
		expect(interactionWeight(model, finished('m:movie', 0), NOW)).toBe(SIGNAL_WEIGHTS.finished);
		expect(
			interactionWeight(model, { key: 'm:movie', watched: { fraction: 0.5, at: NOW } }, NOW)
		).toBeCloseTo(0.55);
		expect(interactionWeight(model, { key: 'm:movie', watchlistedAt: NOW }, NOW)).toBe(
			SIGNAL_WEIGHTS.watchlisted
		);
	});

	it('decays with age but keeps a floor for finished titles', () => {
		const halfLife = interactionWeight(model, finished('m:movie', SIGNAL_HALF_LIFE_DAYS), NOW);
		expect(halfLife).toBeCloseTo(0.5);
		expect(interactionWeight(model, finished('m:movie', 3650), NOW)).toBe(
			SIGNAL_WEIGHTS.finishedFloor
		);
	});

	it('marks a barely-started, long-untouched title as abandoned', () => {
		const at = NOW - (ABANDON_AFTER_DAYS + 1) * DAY;
		expect(
			interactionWeight(model, { key: 'm:movie', watched: { fraction: 0.1, at } }, NOW)
		).toBeLessThan(0);
		// Recent: still just in progress.
		expect(
			interactionWeight(model, { key: 'm:movie', watched: { fraction: 0.1, at: NOW } }, NOW)
		).toBeGreaterThan(0);
		const pilotOnly = { fraction: 0.2, finishedEpisodes: 0, startedEpisodes: 1, at };
		expect(interactionWeight(model, { key: 's:show', watched: pilotOnly }, NOW)).toBeLessThan(0);
	});

	it('grows with finished episodes, capped', () => {
		const show = (finishedEpisodes: number) =>
			interactionWeight(
				model,
				{
					key: 's:show',
					watched: { fraction: 1, finishedEpisodes, startedEpisodes: finishedEpisodes, at: NOW }
				},
				NOW
			);
		expect(show(3)).toBeGreaterThan(show(1));
		expect(show(500)).toBe(SIGNAL_WEIGHTS.seriesCap);
	});

	it('is 0 for an unknown title', () => {
		expect(interactionWeight(model, finished('m:gone'), NOW)).toBe(0);
	});
});

describe('recommendFor', () => {
	const opts = { now: NOW, seed: 'profile' };

	it('recommends neighbours of what the profile watched and excludes seen titles', () => {
		const model = buildModel([
			item('m:seen', { genres: ['Horror'], keywords: [1] }),
			item('m:started', { genres: ['Horror'], keywords: [1] }),
			item('m:horror', { genres: ['Horror'], keywords: [1], rating: 6 }),
			item('m:comedy', { genres: ['Comedy'], rating: 9 }),
			...filler(10, { genres: ['Comedy'] })
		]);
		const picks = recommendFor(
			model,
			[finished('m:seen'), { key: 'm:started', watched: { fraction: 0.4, at: NOW } }],
			opts
		);
		expect(picks.personal).toBe(true);
		expect(picks.keys[0]).toBe('m:horror');
		expect(picks.keys).not.toContain('m:seen');
		expect(picks.keys).not.toContain('m:started');
	});

	it('pushes down neighbours of an abandoned title', () => {
		const at = NOW - (ABANDON_AFTER_DAYS + 1) * DAY;
		const model = buildModel([
			item('m:liked', { genres: ['Drama'] }),
			item('m:abandoned', { genres: ['Western'], keywords: [7] }),
			item('m:drama', { genres: ['Drama'] }),
			item('m:western', { genres: ['Western'], keywords: [7], rating: 9 })
		]);
		const { keys } = recommendFor(
			model,
			[finished('m:liked'), { key: 'm:abandoned', watched: { fraction: 0.05, at } }],
			opts
		);
		expect(keys.indexOf('m:drama')).toBeLessThan(keys.indexOf('m:western'));
	});

	it('falls back to popular picks without a positive signal', () => {
		const model = buildModel([
			item('m:loved', { rating: 9, voteCount: 20000, popularity: 80 }),
			item('m:obscure', { rating: 9.5, voteCount: 3, popularity: 1 }),
			item('m:meh', { rating: 5, voteCount: 20000, popularity: 5 })
		]);
		const picks = recommendFor(model, [], opts);
		expect(picks.personal).toBe(false);
		// Bayesian averaging: 3 votes of 9.5 don't beat 20k votes of 9.
		expect(picks.keys[0]).toBe('m:loved');
	});

	it('is stable within a day and rotates across days', () => {
		const model = buildModel(filler(40));
		const day1 = popularPicks(model, { ...opts, limit: 10 });
		expect(popularPicks(model, { ...opts, limit: 10 })).toEqual(day1);
		expect(popularPicks(model, { ...opts, now: NOW + 3 * DAY, limit: 10 })).not.toEqual(day1);
	});
});

describe('diversify', () => {
	it(`keeps at most ${MAX_PER_COLLECTION} titles per collection`, () => {
		const model = buildModel([
			...[1, 2, 3, 4].map((n) => item(`m:part-${n}`, { collectionId: 7 })),
			item('m:other')
		]);
		const ranked = model.items.map((i, n) => ({ key: i.key, score: 10 - n }));
		const keys = diversify(model, ranked, 5);
		expect(keys.filter((k) => k.startsWith('m:part'))).toHaveLength(MAX_PER_COLLECTION);
		expect(keys).toContain('m:other');
	});

	it('lifts a different title above a near-duplicate of the top pick', () => {
		const model = buildModel([
			item('m:top', { genres: ['Drama'], keywords: [1], makers: ['A'] }),
			item('m:clone', { genres: ['Drama'], keywords: [1], makers: ['A'] }),
			item('m:different', { genres: ['Comedy'] }),
			item('m:last')
		]);
		const ranked = [
			{ key: 'm:top', score: 1 },
			{ key: 'm:clone', score: 0.95 },
			{ key: 'm:different', score: 0.9 },
			{ key: 'm:last', score: 0 }
		];
		expect(diversify(model, ranked, 2)).toEqual(['m:top', 'm:different']);
	});
});

describe('becauseYouWatched', () => {
	const model = buildModel([
		item('m:recent', { genres: ['Horror'], collectionId: 1 }),
		item('m:recent-2', { genres: ['Horror'], collectionId: 1 }),
		item('m:older', { genres: ['Comedy'] }),
		...filler(5, { genres: ['Horror'] }).map((i, n) => ({ ...i, key: `m:horror-${n}` })),
		...filler(5, { genres: ['Comedy'] }).map((i, n) => ({ ...i, key: `m:comedy-${n}` }))
	]);

	it('builds rows from the most recent strong seeds, one per collection', () => {
		const rows = becauseYouWatched(
			model,
			[finished('m:older', 5), finished('m:recent', 1), finished('m:recent-2', 2)],
			{ now: NOW }
		);
		expect(rows.map((r) => r.seedKey)).toEqual(['m:recent', 'm:older']);
		expect(rows[0].keys.every((k) => k.startsWith('m:horror'))).toBe(true);
		expect(rows[1].keys.every((k) => k.startsWith('m:comedy'))).toBe(true);
	});

	it('avoids excluded titles while enough others remain', () => {
		const rows = becauseYouWatched(model, [finished('m:older')], {
			now: NOW,
			exclude: ['m:comedy-0']
		});
		expect(rows[0].keys).toHaveLength(4);
		expect(rows[0].keys).not.toContain('m:comedy-0');
	});

	it('repeats excluded titles rather than drop a short row', () => {
		const rows = becauseYouWatched(model, [finished('m:older')], {
			now: NOW,
			exclude: ['m:comedy-0', 'm:comedy-1']
		});
		expect(rows[0].keys).toHaveLength(5);
	});

	it('drops a row with too few unseen neighbours', () => {
		const rows = becauseYouWatched(
			model,
			['m:older', 'm:comedy-0', 'm:comedy-1'].map((key) => finished(key)),
			{ now: NOW }
		);
		// Only comedy-2..4 are left unseen.
		expect(rows).toEqual([]);
	});

	it('ignores weak seeds', () => {
		const rows = becauseYouWatched(
			model,
			[{ key: 'm:older', watched: { fraction: 0.1, at: NOW } }],
			{ now: NOW }
		);
		expect(rows).toEqual([]);
	});
});

describe('trending', () => {
	const model = buildModel([
		item('m:binged', { popularity: 5 }),
		item('m:shared', { popularity: 5 }),
		item('m:popular', { popularity: 500 }),
		item('m:old', { popularity: 5 })
	]);
	const play = (key: string, profileId: string, daysAgo: number, hour = 0) => ({
		titleId: `id-${key}`,
		profileId,
		at: NOW - daysAgo * DAY + hour * 3_600_000
	});

	it('counts each viewer once per day and favours many viewers', () => {
		const keys = trending(
			model,
			[
				...[0, 1, 2, 3].map((h) => play('m:binged', 'p1', 1, h)),
				play('m:shared', 'p1', 1),
				play('m:shared', 'p2', 1)
			],
			{ now: NOW }
		);
		expect(keys.indexOf('m:shared')).toBeLessThan(keys.indexOf('m:binged'));
	});

	it('decays old plays and ignores those outside the window', () => {
		const keys = trending(model, [play('m:old', 'p1', 30), play('m:binged', 'p1', 2)], {
			now: NOW
		});
		expect(keys.indexOf('m:binged')).toBeLessThan(keys.indexOf('m:old'));
	});

	it("doesn't let one viewer's play outrank a clearly more popular title", () => {
		const library = buildModel([
			item('m:watched', { popularity: 20 }),
			item('m:popular', { popularity: 200 })
		]);
		const keys = trending(library, [play('m:watched', 'p1', 0)], { now: NOW });
		expect(keys).toEqual(['m:popular', 'm:watched']);
	});

	it('lets many viewers lift a title over a slightly more popular one', () => {
		const library = buildModel([
			item('m:watched', { popularity: 150 }),
			item('m:popular', { popularity: 200 })
		]);
		const plays = ['p1', 'p2', 'p3', 'p4'].flatMap((p) =>
			[0, 1].map((d) => play('m:watched', p, d))
		);
		expect(trending(library, plays, { now: NOW })[0]).toBe('m:watched');
	});

	it('ignores local plays for titles without TMDB popularity', () => {
		const library = buildModel([
			item('m:watched', { popularity: null, rating: 6 }),
			item('m:better', { popularity: null, rating: 8 })
		]);
		const keys = trending(library, [play('m:watched', 'p1', 0), play('m:watched', 'p2', 0)], {
			now: NOW
		});
		expect(keys).toEqual(['m:better', 'm:watched']);
	});

	it('falls back to TMDB popularity without plays', () => {
		expect(trending(model, [], { now: NOW })[0]).toBe('m:popular');
	});
});

describe('jitter', () => {
	it('is deterministic and in 0..1', () => {
		expect(jitter('a', 'b')).toBe(jitter('a', 'b'));
		expect(jitter('a', 'b')).not.toBe(jitter('a', 'c'));
		expect(jitter('x', 'y')).toBeGreaterThanOrEqual(0);
		expect(jitter('x', 'y')).toBeLessThanOrEqual(1);
	});
});
