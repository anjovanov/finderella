import { describe, expect, it } from 'vitest';
import { audioLabel, directPlayAudio, pickAudioTrack, toAudioTracks, type AudioRow } from './audio';

function row(overrides: Partial<AudioRow>): AudioRow {
	return {
		id: `a${overrides.streamIndex ?? 1}`,
		mediaFileId: 'f',
		streamIndex: 1,
		codec: 'aac',
		language: null,
		title: null,
		channels: null,
		isDefault: false,
		commentary: false,
		descriptive: false,
		createdAt: new Date(0),
		...overrides
	};
}

describe('audioLabel', () => {
	it('names the language and channel layout', () => {
		expect(audioLabel(row({ language: 'en', channels: 6 }), 0)).toBe('English (5.1)');
		expect(audioLabel(row({ language: 'ja', channels: 2 }), 1)).toBe('Japanese (Stereo)');
		expect(audioLabel(row({ language: 'de', channels: 3 }), 1)).toBe('German (3 ch)');
	});

	it('keeps informative titles and drops redundant ones', () => {
		expect(audioLabel(row({ language: 'en', title: 'English 5.1', channels: 6 }), 0)).toBe(
			'English (5.1)'
		);
		expect(audioLabel(row({ language: 'en', title: 'Surround 7.1' }), 0)).toBe('English');
		expect(audioLabel(row({ language: 'fr', title: 'Québécois', channels: 2 }), 0)).toBe(
			'French – Québécois (Stereo)'
		);
	});

	it('marks commentary and audio description', () => {
		expect(
			audioLabel(row({ language: 'en', title: 'Director Commentary', commentary: true }), 0)
		).toBe('English – Director Commentary');
		expect(audioLabel(row({ language: 'en', commentary: true, channels: 2 }), 0)).toBe(
			'English – Commentary (Stereo)'
		);
		expect(audioLabel(row({ language: 'en', descriptive: true }), 0)).toBe(
			'English – Audio description'
		);
	});

	it('falls back to the title, then the position', () => {
		expect(audioLabel(row({ title: 'Original mix' }), 2)).toBe('Original mix');
		expect(audioLabel(row({}), 2)).toBe('Track 3');
	});
});

describe('toAudioTracks', () => {
	it('lists streams in container order and numbers duplicate labels', () => {
		const tracks = toAudioTracks([
			row({ id: 'b', streamIndex: 2, language: 'en', channels: 2 }),
			row({ id: 'a', streamIndex: 1, language: 'en', channels: 2, isDefault: true })
		]);
		expect(tracks).toEqual([
			{ id: 'a', label: 'English (Stereo)', language: 'en', default: true },
			{ id: 'b', label: 'English (Stereo) 2', language: 'en', default: false }
		]);
	});
});

describe('pickAudioTrack', () => {
	const eng = row({ id: 'eng', streamIndex: 1, language: 'en' });
	const jpn = row({ id: 'jpn', streamIndex: 2, language: 'ja', isDefault: true });
	const jpnCommentary = row({ id: 'jpnc', streamIndex: 3, language: 'ja', commentary: true });
	const rows = [jpnCommentary, eng, jpn];

	it('prefers an explicit pick that belongs to the file', () => {
		expect(pickAudioTrack(rows, { trackId: 'eng', language: 'ja' })?.id).toBe('eng');
		expect(pickAudioTrack(rows, { trackId: 'other-file', language: 'en' })?.id).toBe('eng');
	});

	it("uses the preferred language's main track", () => {
		expect(pickAudioTrack([jpnCommentary, eng], { language: 'ja' })?.id).toBe('eng');
		expect(pickAudioTrack(rows, { language: 'ja' })?.id).toBe('jpn');
	});

	it('falls back to the default-flagged stream, then the first', () => {
		expect(pickAudioTrack(rows, { language: 'fr' })?.id).toBe('jpn');
		expect(pickAudioTrack(rows, { language: 'default' })?.id).toBe('jpn');
		expect(pickAudioTrack([jpnCommentary, eng], {})?.id).toBe('eng');
		expect(pickAudioTrack([], {})).toBeNull();
	});
});

describe('directPlayAudio', () => {
	it('is the first stream in the container', () => {
		expect(
			directPlayAudio([row({ id: 'b', streamIndex: 4 }), row({ id: 'a', streamIndex: 2 })])?.id
		).toBe('a');
		expect(directPlayAudio([])).toBeNull();
	});
});
