import { describe, expect, it } from 'vitest';
import { isSampleFile, parseEpisodePath, parseMoviePath, slugify, themeFromSlug } from './parse';

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

	it('prefers a bracketed year, then the last plausible year before the junk', () => {
		expect(parseMoviePath('Blade Runner 2049 (2017).mkv')).toEqual({
			title: 'Blade Runner 2049',
			year: 2017
		});
		expect(parseMoviePath('Blade.Runner.2049.2017.1080p.BluRay.x264-GRP.mkv')).toEqual({
			title: 'Blade Runner 2049',
			year: 2017
		});
		expect(parseMoviePath('2001 A Space Odyssey (1968).mkv')).toEqual({
			title: '2001 A Space Odyssey',
			year: 1968
		});
		expect(parseMoviePath('2012 (2009).mkv')).toEqual({ title: '2012', year: 2009 });
		// A year after the release junk still counts when nothing precedes it.
		expect(parseMoviePath('Movie.1080p.x264.2019.mkv')).toEqual({ title: 'Movie', year: 2019 });
	});

	it('rejects numbers that cannot be a release year', () => {
		// 2049 is part of the title, not a year; next year is still a valid label.
		expect(parseMoviePath('Blade Runner 2049.mkv')).toEqual({ title: 'Blade Runner 2049' });
		const next = new Date().getFullYear() + 1;
		expect(parseMoviePath(`Upcoming (${next}).mkv`)).toEqual({ title: 'Upcoming', year: next });
		expect(parseMoviePath(`Far Off (${next + 1}).mkv`)).toEqual({ title: `Far Off (${next + 1})` });
		expect(parseMoviePath('1917 (2019).mkv')).toEqual({ title: '1917', year: 2019 });
		expect(parseMoviePath('1917.mkv')).toEqual({ title: '1917' });
	});

	it('falls back to the nearest folder with a year when the file has none', () => {
		expect(parseMoviePath('Inception (2010)/movie.mkv')).toEqual({
			title: 'Inception',
			year: 2010
		});
		expect(parseMoviePath('Inception (2010)/Inception.mkv')).toEqual({
			title: 'Inception',
			year: 2010
		});
		expect(parseMoviePath('Nolan/Inception (2010) [1080p] [YTS.MX]/Inception.mkv')).toEqual({
			title: 'Inception',
			year: 2010
		});
		// The file wins whenever it carries a year itself.
		expect(parseMoviePath('Inception (2010)/Inception.2011.1080p.mp4').year).toBe(2011);
		// No year anywhere: the filename title stands.
		expect(parseMoviePath('Christopher Nolan/Inception.mkv')).toEqual({ title: 'Inception' });
	});
});

describe('isSampleFile', () => {
	it('skips short clips whose name or folder says sample', () => {
		expect(isSampleFile('Inception (2010)/Sample/sample.mkv')).toBe(true);
		expect(isSampleFile('Inception (2010)/inception-sample.mkv', 60_000)).toBe(true);
		expect(isSampleFile('Inception.2010.sample.1080p.mkv')).toBe(true);
		expect(isSampleFile('Breaking Bad S01E06/Samples/clip.mkv', 45_000)).toBe(true);
	});

	it('keeps feature-length titles that happen to be called Sample', () => {
		expect(isSampleFile('Sample (2020)/sample.mkv', 2 * 3_600_000)).toBe(false);
		expect(isSampleFile('Sample.mkv', 100 * 60_000)).toBe(false);
		expect(isSampleFile('Sample S01E01.mkv', 25 * 60_000)).toBe(false);
	});

	it('leaves ordinary files alone', () => {
		expect(isSampleFile('Inception (2010)/Inception (2010).mkv')).toBe(false);
		expect(isSampleFile('Samples of Life (2019).mkv', 90 * 60_000)).toBe(false);
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

	it('trims season-pack markers from show folder names', () => {
		expect(
			parseEpisodePath(
				'Rick And Morty S01 S02 S03 Complete BluRay H264 5.1 BONE/SEASON 1/Rick And Morty S01E01 720p BluRay 5.1 BONE.mp4'
			)
		).toEqual({
			showTitle: 'Rick And Morty',
			season: 1,
			episode: 1,
			episodeTitle: undefined,
			year: undefined
		});
		expect(parseEpisodePath('Show Season 1-3 Complete/Season 2/Show S02E03.mkv')).toMatchObject({
			showTitle: 'Show',
			season: 2,
			episode: 3
		});
	});

	it('trims a full episode marker from single-episode release folders', () => {
		expect(
			parseEpisodePath(
				'American Horror Story S12E02 Rockabye REPACK 1080p AMZN WEB-DL DDP5 1 H 264-FLUX[TGx]/American Horror Story S12E02 Rockabye REPACK 1080p AMZN WEB-DL DDP5 1 H 264-FLUX.mkv'
			)
		).toEqual({
			showTitle: 'American Horror Story',
			season: 12,
			episode: 2,
			episodeTitle: 'Rockabye',
			year: undefined
		});
	});

	it('falls back to a year in the filename prefix when the folder has none', () => {
		expect(
			parseEpisodePath('Invincible S04/Invincible.2021.S04E01.1080p.WEB.h264-ETHEL[EZTVx.to].mkv')
		).toEqual({
			showTitle: 'Invincible',
			season: 4,
			episode: 1,
			episodeTitle: undefined,
			year: 2021
		});
		// Folder year wins over the filename.
		expect(parseEpisodePath('Show (2010)/Show.2011.S01E01.mkv')?.year).toBe(2010);
		// Never read a year from after the marker: that is the episode title.
		expect(parseEpisodePath('Show/S01E01 - Pilot (2008).mkv')).toMatchObject({
			showTitle: 'Show',
			episodeTitle: 'Pilot (2008)',
			year: undefined
		});
	});

	it('takes the episode marker from the nearest folder when the file has none', () => {
		expect(parseEpisodePath('Breaking Bad S01E04/video.mkv')).toMatchObject({
			showTitle: 'Breaking Bad',
			season: 1,
			episode: 4,
			episodeTitle: undefined
		});
		expect(parseEpisodePath('Breaking Bad S01E05 - Gray Matter/Gray Matter.mkv')).toMatchObject({
			showTitle: 'Breaking Bad',
			season: 1,
			episode: 5,
			episodeTitle: 'Gray Matter'
		});
		expect(
			parseEpisodePath('Breaking Bad (2008)/Season 1/Breaking Bad S01E01 - Pilot/video.mkv')
		).toEqual({
			showTitle: 'Breaking Bad',
			season: 1,
			episode: 1,
			episodeTitle: 'Pilot',
			year: 2008
		});
		expect(parseEpisodePath('Breaking Bad/random.mkv')).toBeNull();
	});

	it('parses a loose release file in the library root', () => {
		expect(parseEpisodePath('Silo.S03E09.1080p.HEVC.x265-MeGusta[EZTVx.to].mkv')).toEqual({
			showTitle: 'Silo',
			season: 3,
			episode: 9,
			episodeTitle: undefined,
			year: undefined
		});
	});

	it('keeps the year when a season marker follows it in the folder name', () => {
		expect(
			parseEpisodePath(
				"Silo (2023) Season 1 S01 (1080p ATVP WEB-DL x265 HEVC 10bit EAC3 Atmos 5.1 t3nzin)/Silo (2023) - S01E05 - The Janitor's Boy (1080p ATVP WEB-DL x265 t3nzin).mkv"
			)
		).toEqual({
			showTitle: 'Silo',
			season: 1,
			episode: 5,
			episodeTitle: "The Janitor's Boy",
			year: 2023
		});
	});

	it('does not strip dangling brackets into an empty title or cut leading marker words', () => {
		expect(parseEpisodePath('Complete Savages/S01E01 - Pilot.mkv')).toMatchObject({
			showTitle: 'Complete Savages',
			episodeTitle: 'Pilot'
		});
		expect(parseEpisodePath('Show/S01E02 - Title [1080p].mkv')?.episodeTitle).toBe('Title');
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
