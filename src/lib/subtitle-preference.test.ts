import { describe, expect, it } from 'vitest';
import { isKnownLanguage, pickSubtitleTrack, preferenceForTrack } from './subtitle-preference';
import type { SubtitleTrack } from './data/types';

function track(overrides: Partial<SubtitleTrack> & { id: string }): SubtitleTrack {
	return {
		src: `/s/${overrides.id}.vtt`,
		srclang: 'en',
		label: overrides.id,
		kind: 'subtitles',
		default: false,
		forced: false,
		...overrides
	};
}

const tracks = [
	track({ id: 'en-forced', forced: true }),
	track({ id: 'en-sdh', kind: 'captions' }),
	track({ id: 'en' }),
	track({ id: 'fr', srclang: 'fr', default: true })
];

describe('preferenceForTrack', () => {
	it('remembers known languages and off, but never an unknown track language', () => {
		expect(preferenceForTrack(tracks[2])).toEqual({ language: 'en' });
		expect(preferenceForTrack(null)).toBe('off');
		expect(preferenceForTrack(track({ id: 'und', srclang: 'und', label: 'Track 1' }))).toBeNull();
		expect(isKnownLanguage('und')).toBe(false);
		expect(isKnownLanguage('fr')).toBe(true);
		expect(isKnownLanguage('eng')).toBe(false);
	});
});

describe('pickSubtitleTrack', () => {
	it('prefers the plain track in the remembered language, then SDH, then forced', () => {
		expect(pickSubtitleTrack(tracks, { language: 'en' })?.id).toBe('en');
		expect(pickSubtitleTrack(tracks.slice(0, 2), { language: 'en' })?.id).toBe('en-sdh');
		expect(pickSubtitleTrack(tracks.slice(0, 1), { language: 'en' })?.id).toBe('en-forced');
	});

	it('turns English on by default, else the container default track', () => {
		expect(pickSubtitleTrack(tracks, null)?.id).toBe('en');
		expect(pickSubtitleTrack(tracks.slice(0, 2), null)?.id).toBe('en-sdh');
		const noEnglish = tracks.filter((t) => t.srclang !== 'en');
		expect(pickSubtitleTrack(noEnglish, null)?.id).toBe('fr');
		expect(pickSubtitleTrack([track({ id: 'de', srclang: 'de' })], null)).toBeNull();
	});

	it('falls back to the default track for a language the title lacks, and honours off', () => {
		expect(pickSubtitleTrack(tracks, { language: 'de' })?.id).toBe('fr');
		expect(pickSubtitleTrack(tracks.slice(0, 3), { language: 'de' })).toBeNull();
		expect(pickSubtitleTrack(tracks, 'off')).toBeNull();
	});
});
