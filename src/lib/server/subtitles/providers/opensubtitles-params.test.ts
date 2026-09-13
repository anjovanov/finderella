import { describe, expect, it } from 'vitest';
import { buildOpenSubtitlesSearchParams } from './opensubtitles-params';

describe('buildOpenSubtitlesSearchParams', () => {
	it('sorts keys, lowercases values and omits defaults', () => {
		const params = buildOpenSubtitlesSearchParams(
			{ kind: 'movie', tmdbId: 27205, title: 'Inception', year: 2010, fileName: 'x.mkv' },
			'pt'
		);
		expect(params.toString()).toBe('languages=pt-br%2Cpt-pt&tmdb_id=27205&type=movie');
	});

	it('sends the moviehash alongside the ids', () => {
		expect(
			buildOpenSubtitlesSearchParams(
				{
					kind: 'movie',
					tmdbId: 27205,
					title: 'Inception',
					fileName: 'x',
					movieHash: '8E245D9679D31E12'
				},
				'en'
			).toString()
		).toBe('languages=en&moviehash=8e245d9679d31e12&tmdb_id=27205&type=movie');
	});

	it('uses parent ids for episodes and a text query without a tmdb id', () => {
		expect(
			buildOpenSubtitlesSearchParams(
				{
					kind: 'episode',
					tmdbId: 693,
					title: 'Desperate Housewives',
					season: 1,
					episode: 5,
					fileName: 'x'
				},
				'en',
				{ excludeAi: true }
			).toString()
		).toBe(
			'ai_translated=exclude&episode_number=5&languages=en&parent_tmdb_id=693&season_number=1&type=episode'
		);
		expect(
			buildOpenSubtitlesSearchParams(
				{ kind: 'movie', title: 'Blade Runner', year: 1982, fileName: 'x' },
				'en'
			).toString()
		).toBe('languages=en&query=blade+runner&type=movie&year=1982');
	});
});
