import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { episodeTag, listZipSubtitles, looksLikeZip, pickZipSubtitle } from './zip';

const enc = (s: string) => new TextEncoder().encode(s);

describe('zip subtitle selection', () => {
	const archive = zipSync({
		'readme.txt': enc('hi'),
		'__MACOSX/._x.srt': enc('junk'),
		'Show.S01E01.srt': enc('1\n00:00:01,000 --> 00:00:02,000\none'),
		'Show.S01E02.srt': enc('1\n00:00:01,000 --> 00:00:02,000\ntwo two two'),
		'vobsub.sub': enc('binary'),
		'vobsub.idx': enc('binary')
	});

	it('lists only text subtitle entries', () => {
		expect(looksLikeZip(archive)).toBe(true);
		expect(looksLikeZip(enc('WEBVTT'))).toBe(false);
		expect(listZipSubtitles(archive).map((e) => e.name)).toEqual([
			'Show.S01E01.srt',
			'Show.S01E02.srt'
		]);
	});

	it('picks the wanted episode from a pack, else the largest file', () => {
		const entries = listZipSubtitles(archive);
		expect(pickZipSubtitle(entries, { season: 1, episode: 1 })?.name).toBe('Show.S01E01.srt');
		expect(pickZipSubtitle(entries, { season: 1, episode: 9 })?.name).toBe('Show.S01E02.srt');
		expect(pickZipSubtitle(entries, {})?.name).toBe('Show.S01E02.srt');
		expect(pickZipSubtitle([], {})).toBeNull();
	});

	it('never inflates oversized entries', () => {
		const big = zipSync({
			'huge.srt': new Uint8Array(2 * 1024 * 1024 + 1),
			'ok.srt': enc('1\n00:00:01,000 --> 00:00:02,000\nx')
		});
		expect(listZipSubtitles(big).map((e) => e.name)).toEqual(['ok.srt']);
	});

	it('narrows to the wanted script when an archive carries both', () => {
		const both = zipSync({
			'Film.cyr.srt': enc('1\n00:00:01,000 --> 00:00:02,000\nЋирилица'),
			'Film.srt': enc('1\n00:00:01,000 --> 00:00:02,000\nLatinica dulja verzija')
		});
		const entries = listZipSubtitles(both);
		expect(pickZipSubtitle(entries, {}, { script: 'cyrillic' })?.name).toBe('Film.cyr.srt');
		expect(pickZipSubtitle(entries, {}, { script: 'latin' })?.name).toBe('Film.srt');
		expect(pickZipSubtitle(entries, {})?.name).toBe('Film.srt');
	});

	it('reads episode tags in both common spellings', () => {
		expect(episodeTag('Show.S01E02.srt')).toBe('s1e2');
		expect(episodeTag('show 1x02.srt')).toBe('s1e2');
		expect(episodeTag('movie.srt')).toBeNull();
	});
});
