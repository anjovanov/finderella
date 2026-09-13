import { describe, expect, it } from 'vitest';
import { sidecarRelPath } from './naming';

describe('sidecarRelPath', () => {
	it('names the file the way the scanner reads it back', () => {
		expect(
			sidecarRelPath('Inception (2010)/Inception.2010.mkv', {
				language: 'en',
				hearingImpaired: false,
				format: 'srt'
			})
		).toBe('Inception (2010)/Inception.2010.en.srt');
		expect(
			sidecarRelPath('movie.mp4', {
				language: 'fr',
				hearingImpaired: true,
				format: 'srt',
				attempt: 2
			})
		).toBe('movie.fr.hi.2.srt');
	});
});
