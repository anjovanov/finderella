import { describe, expect, it } from 'vitest';
import {
	mapGenres,
	movieMaturity,
	normalizeTitle,
	pickBestMatch,
	pickTrailer,
	scanTitleFromSlug,
	tvMaturity,
	type TrailerCandidate,
	yearOf
} from './map';

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

	it('never matches on year alone', () => {
		// The ingest year may be a guess (file mtime); a same-year unrelated show is not a hit.
		const sameYear = [{ id: 9, titles: ['Love of Silom'], year: 2026, popularity: 5 }];
		expect(pickBestMatch(sameYear, 'Silo', 2026)).toBeUndefined();
	});

	it('ignores original titles that normalize to nothing', () => {
		// Thai/Japanese originals strip to '' — which is a prefix of every title.
		const foreign = [
			{ id: 9, titles: ['Love of Silom', 'รักสีลม'], year: 2026, popularity: 5 },
			{ id: 8, titles: ['BAKI-DOU: The Invincible Samurai', 'バキ道'], year: 2026, popularity: 9 }
		];
		expect(pickBestMatch(foreign, 'Silo', 2026)).toBeUndefined();
		expect(pickBestMatch(foreign, 'Invincible', 2026)).toBeUndefined();
		expect(pickBestMatch(results, 'Silo', 2010)).toBeUndefined();
	});

	it('uses the year to split exact-title candidates', () => {
		const remakes = [
			{ id: 1, titles: ['Invincible'], year: 2021, popularity: 90 },
			{ id: 2, titles: ['Invincible'], year: 2026, popularity: 10 }
		];
		expect(pickBestMatch(remakes, 'Invincible', 2026)?.id).toBe(2);
		expect(pickBestMatch(remakes, 'Invincible')?.id).toBe(1);
	});
});

describe('pickTrailer', () => {
	const yt = (key: string, type: string, extra: Partial<TrailerCandidate> = {}) => ({
		key,
		site: 'YouTube',
		type,
		official: true,
		iso_639_1: 'en',
		...extra
	});

	it('prefers trailers over teasers and ignores featurettes/clips', () => {
		const videos = [yt('feat', 'Featurette'), yt('tease', 'Teaser'), yt('trail', 'Trailer')];
		expect(pickTrailer(videos)?.key).toBe('trail');
		expect(pickTrailer([yt('feat', 'Featurette'), yt('tease', 'Teaser')])?.key).toBe('tease');
	});

	it('prefers official English uploads, keeping TMDB order on ties', () => {
		expect(
			pickTrailer([
				yt('fan', 'Trailer', { official: false }),
				yt('de', 'Trailer', { iso_639_1: 'de' }),
				yt('en', 'Trailer'),
				yt('en2', 'Trailer')
			])?.key
		).toBe('en');
	});

	it('only picks YouTube hosts and returns undefined when nothing qualifies', () => {
		expect(pickTrailer([yt('v', 'Trailer', { site: 'Vimeo' })])).toBeUndefined();
		expect(pickTrailer([yt('c', 'Clip'), yt('b', 'Behind the Scenes')])).toBeUndefined();
		expect(pickTrailer([])).toBeUndefined();
		expect(pickTrailer(undefined)).toBeUndefined();
	});
});

describe('scanTitleFromSlug', () => {
	it("recovers the scan title and drops a movie slug's year tail", () => {
		expect(scanTitleFromSlug('avatar-fire-and-ash-2025', 'movie')).toBe('avatar fire and ash');
		expect(scanTitleFromSlug('blade-runner-2049', 'movie')).toBe('blade runner 2049');
		expect(scanTitleFromSlug('2012-2009', 'movie')).toBe('2012');
		expect(scanTitleFromSlug('1917', 'movie')).toBe('1917');
	});

	it('keeps series slugs whole', () => {
		expect(scanTitleFromSlug('rick-and-morty', 'series')).toBe('rick and morty');
		expect(scanTitleFromSlug('the-4400', 'series')).toBe('the 4400');
	});
});
