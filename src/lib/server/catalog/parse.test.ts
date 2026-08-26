import { describe, expect, it } from 'vitest';
import { parseEpisodePath, parseMoviePath, slugify, themeFromSlug } from './parse';

describe('parseMoviePath', () => {
	it('parses "Title (Year)" naming', () => {
		expect(parseMoviePath('The Hollow Meridian (2019).mkv')).toEqual({
			title: 'The Hollow Meridian',
			year: 2019
		});
	});

	it('parses dotted release names and strips junk', () => {
		expect(parseMoviePath('Some.Movie.2021.1080p.BluRay.x264.mp4')).toEqual({
			title: 'Some Movie',
			year: 2021
		});
	});

	it('handles nested folders and no year', () => {
		expect(parseMoviePath('Some Movie (2020)/Some Movie (2020).mkv').year).toBe(2020);
		expect(parseMoviePath('Plain Title.mp4')).toEqual({ title: 'Plain Title' });
	});
});

describe('parseEpisodePath', () => {
	it('parses the Show/Season/SxxEyy convention', () => {
		expect(parseEpisodePath('Harbor of Echoes/Season 01/S01E02 - The Tidewalker.mkv')).toEqual({
			showTitle: 'Harbor of Echoes',
			season: 1,
			episode: 2,
			episodeTitle: 'The Tidewalker',
			year: undefined
		});
	});

	it('parses bare dotted names with the show before the marker', () => {
		expect(parseEpisodePath('Show.Name.S02E10.720p.HDTV.mkv')).toMatchObject({
			showTitle: 'Show Name',
			season: 2,
			episode: 10
		});
	});

	it('parses NxNN style and show-folder years', () => {
		expect(parseEpisodePath('Show Name (2018)/1x02 Pilot Part 2.mkv')).toMatchObject({
			showTitle: 'Show Name',
			year: 2018,
			season: 1,
			episode: 2
		});
	});

	it('returns null when no episode marker exists', () => {
		expect(parseEpisodePath('Random File.mkv')).toBeNull();
	});
});

describe('slugify / theme', () => {
	it('slugifies to url-safe lowercase', () => {
		expect(slugify('The Hollow Meridian')).toBe('the-hollow-meridian');
		expect(slugify('Amélie & Co.!')).toBe('amelie-co');
		expect(slugify('***')).toBe('untitled');
	});

	it('produces stable hues in range', () => {
		const theme = themeFromSlug('the-hollow-meridian');
		expect(theme).toEqual(themeFromSlug('the-hollow-meridian'));
		expect(theme.hue).toBeGreaterThanOrEqual(0);
		expect(theme.hue).toBeLessThan(360);
		expect(theme.hue2).toBeGreaterThanOrEqual(0);
		expect(theme.hue2).toBeLessThan(360);
	});
});
