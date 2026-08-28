import { describe, expect, it } from 'vitest';
import { mapGenres, movieMaturity, normalizeTitle, pickBestMatch, tvMaturity, yearOf } from './map';

describe('mapGenres', () => {
	it('maps TMDB names onto the fixed tuple, splitting combined TV genres', () => {
		expect(mapGenres(['Science Fiction', 'Drama'])).toEqual(['Sci-Fi', 'Drama']);
		expect(mapGenres(['Sci-Fi & Fantasy'])).toEqual(['Sci-Fi', 'Fantasy']);
		expect(mapGenres(['Action & Adventure', 'Adventure', 'Action'])).toEqual(['Action']);
	});

	it('drops genres the UI has no bucket for', () => {
		expect(mapGenres(['Animation', 'Family', 'Music'])).toEqual([]);
		expect(mapGenres(['Crime', 'Western'])).toEqual(['Thriller']);
	});
});

describe('maturity', () => {
	it('prefers the US theatrical certification and folds NC-17 into R', () => {
		const dates = {
			results: [
				{ iso_3166_1: 'DE', release_dates: [{ certification: '16', type: 3 }] },
				{
					iso_3166_1: 'US',
					release_dates: [
						{ certification: '', type: 1 },
						{ certification: 'NC-17', type: 3 }
					]
				}
			]
		};
		expect(movieMaturity(dates)).toBe('R');
		expect(movieMaturity({ results: [] })).toBeUndefined();
		expect(movieMaturity(null)).toBeUndefined();
	});

	it('maps US TV ratings', () => {
		expect(tvMaturity({ results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] })).toBe('TV-MA');
		expect(tvMaturity({ results: [{ iso_3166_1: 'US', rating: 'TV-Y7' }] })).toBe('G');
		expect(tvMaturity({ results: [{ iso_3166_1: 'GB', rating: '15' }] })).toBeUndefined();
	});
});

describe('normalizeTitle / yearOf', () => {
	it('ignores case, diacritics and punctuation', () => {
		expect(normalizeTitle('Amélie')).toBe('amelie');
		expect(normalizeTitle('Rick And Morty')).toBe('rick and morty');
		expect(normalizeTitle('Mission: Impossible – Dead Reckoning')).toBe(
			'mission impossible dead reckoning'
		);
		expect(normalizeTitle('Copper & Salt')).toBe('copper and salt');
	});

	it('reads the year off a TMDB date', () => {
		expect(yearOf('2023-05-05')).toBe(2023);
		expect(yearOf('')).toBeUndefined();
		expect(yearOf(null)).toBeUndefined();
	});
});

describe('pickBestMatch', () => {
	const results = [
		{ id: 1, titles: ['Nobody'], year: 2021, popularity: 50 },
		{ id: 2, titles: ['Nobody 2'], year: 2025, popularity: 40 },
		{ id: 3, titles: ['Nobody 2', 'Nadie 2'], year: 2010, popularity: 90 }
	];

	it('prefers exact title + year over popularity', () => {
		expect(pickBestMatch(results, 'Nobody 2', 2025)?.id).toBe(2);
	});

	it('breaks ties on popularity when no year is known', () => {
		expect(pickBestMatch(results, 'Nobody 2')?.id).toBe(3);
	});

	it('tolerates a one-year offset and matches original titles', () => {
		expect(pickBestMatch(results, 'Nadie 2', 2011)?.id).toBe(3);
	});

	it('returns nothing rather than an unrelated result', () => {
		expect(pickBestMatch(results, 'Silo', 2023)).toBeUndefined();
		expect(pickBestMatch(results, '***')).toBeUndefined();
	});
});
