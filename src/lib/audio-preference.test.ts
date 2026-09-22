import { describe, expect, it } from 'vitest';
import {
	isAudioLanguage,
	normalizeAudioLanguage,
	preferenceForAudioTrack
} from './audio-preference';

describe('audio preference', () => {
	it("accepts 'default' and known language codes only", () => {
		expect(isAudioLanguage('default')).toBe(true);
		expect(isAudioLanguage('ja')).toBe(true);
		expect(isAudioLanguage('jpn')).toBe(false);
		expect(isAudioLanguage('und')).toBe(false);
		expect(normalizeAudioLanguage('xx')).toBe('default');
		expect(normalizeAudioLanguage(null)).toBe('default');
	});

	it('remembers only tracks with a known language', () => {
		const track = { id: 'a', label: 'Japanese', default: false };
		expect(preferenceForAudioTrack({ ...track, language: 'ja' })).toBe('ja');
		expect(preferenceForAudioTrack({ ...track, language: 'und' })).toBeNull();
	});
});
