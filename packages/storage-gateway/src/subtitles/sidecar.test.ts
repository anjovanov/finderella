import { describe, expect, it } from 'vitest';
import { describeSidecar, matchSidecars } from './sidecar.js';

describe('describeSidecar', () => {
	it('reads language codes, names and flags from the leftover filename', () => {
		expect(describeSidecar('.en')).toMatchObject({ language: 'en', forced: false });
		expect(describeSidecar('.eng.forced')).toMatchObject({ language: 'en', forced: true });
		expect(describeSidecar('2_English')).toMatchObject({ language: 'en' });
		expect(describeSidecar('English SDH')).toMatchObject({ language: 'en', hearingImpaired: true });
		expect(describeSidecar('.pt-BR')).toMatchObject({ language: 'pt' });
		const hi = describeSidecar('.hi');
		expect(hi.hearingImpaired).toBe(true);
		expect(hi.language).toBeUndefined();
		expect(describeSidecar('.hin')).toMatchObject({ language: 'hi' });
	});

	it('keeps short unknown words as a title and drops long junk', () => {
		expect(describeSidecar('.en.commentary').title).toBe('commentary');
		expect(describeSidecar('')).toEqual({ forced: false, hearingImpaired: false });
		expect(describeSidecar('Movie.Name.2019.1080p.BluRay.x264').title).toBeUndefined();
	});
});

describe('matchSidecars', () => {
	it('pairs same-folder files by name prefix and reads the language suffix', () => {
		const tracks = matchSidecars('Inception (2010)/Inception.mkv', {
			videos: ['Inception (2010)/Inception.mkv', 'Inception (2010)/Inception-sample.mkv'],
			subtitles: [
				'Inception (2010)/Inception.srt',
				'Inception (2010)/Inception.es.srt',
				'Inception (2010)/Inception.en.forced.srt',
				'Inception (2010)/Other.srt'
			]
		});
		expect(tracks.map((t) => [t.relPath, t.language, t.forced])).toEqual([
			['Inception (2010)/Inception.srt', undefined, false],
			['Inception (2010)/Inception.es.srt', 'es', false],
			['Inception (2010)/Inception.en.forced.srt', 'en', true],
			// The sample clip doesn't count as a second video, so loose files are claimed too.
			['Inception (2010)/Other.srt', undefined, false]
		]);
		expect(tracks[0]).toMatchObject({ source: 'sidecar', format: 'srt', hearingImpaired: false });
	});

	it('claims Subs/ folder files for a lone video and by name for packs', () => {
		const lone = matchSidecars('Movie/movie.mp4', {
			videos: ['Movie/movie.mp4'],
			subtitles: ['Movie/Subs/2_English.srt', 'Movie/Subs/3_French.srt']
		});
		expect(lone.map((t) => t.language)).toEqual(['en', 'fr']);

		const pack = {
			videos: ['Show S01/Show.S01E01.mkv', 'Show S01/Show.S01E02.mkv'],
			subtitles: [
				'Show S01/Subs/Show.S01E01.srt',
				'Show S01/Subs/Show.S01E02.eng.srt',
				'Show S01/Subs/Show.S01E01/2_English.srt',
				'Show S01/Subs/Show.S01E010.srt'
			]
		};
		expect(matchSidecars('Show S01/Show.S01E01.mkv', pack).map((t) => t.relPath)).toEqual([
			'Show S01/Subs/Show.S01E01.srt',
			'Show S01/Subs/Show.S01E01/2_English.srt'
		]);
		expect(matchSidecars('Show S01/Show.S01E02.mkv', pack).map((t) => t.relPath)).toEqual([
			'Show S01/Subs/Show.S01E02.eng.srt'
		]);
	});

	it('ignores non-subtitle files and reports ass/vtt formats', () => {
		const tracks = matchSidecars('a/b.mkv', {
			videos: ['a/b.mkv'],
			subtitles: ['a/b.ass', 'a/b.vtt', 'a/b.idx', 'a/b.sub']
		});
		expect(tracks.map((t) => t.format)).toEqual(['ass', 'vtt']);
	});
});
