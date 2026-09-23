import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PLAYBACK_SETTINGS,
	minutesLabel,
	normalizePlaybackSettings,
	resolveAudioChannels,
	stillWatchingDueForEpisode,
	stillWatchingMovieSeconds
} from './playback-settings';

describe('playback settings', () => {
	it('keeps valid values and falls back for unknown ones', () => {
		expect(
			normalizePlaybackSettings({
				audioLanguage: 'ja',
				audioChannels: 'surround',
				autoplayNext: false,
				stillWatching: { enabled: true, episodes: 2, minutes: 180 }
			})
		).toEqual({
			audioLanguage: 'ja',
			audioChannels: 'surround',
			autoplayNext: false,
			stillWatching: { enabled: true, episodes: 2, minutes: 180 }
		});
		expect(
			normalizePlaybackSettings({
				audioLanguage: 'jpn',
				audioChannels: '7.1',
				autoplayNext: 'no',
				stillWatching: { enabled: 1, episodes: 7, minutes: 90 }
			})
		).toEqual(DEFAULT_PLAYBACK_SETTINGS);
	});

	it('resolves the audio-channel cap; auto follows the device but never picks mono', () => {
		expect(resolveAudioChannels('mono', null)).toBe(1);
		expect(resolveAudioChannels('stereo', 8)).toBe(2);
		expect(resolveAudioChannels('surround', 2)).toBe(6);
		expect(resolveAudioChannels('auto', 6)).toBe(6);
		expect(resolveAudioChannels('auto', 8)).toBe(6);
		expect(resolveAudioChannels('auto', 2)).toBe(2);
		expect(resolveAudioChannels('auto', 1)).toBe(2);
		expect(resolveAudioChannels('auto', null)).toBe(2);
	});

	it('defaults to auto (stereo unless the device reports surround)', () => {
		expect(DEFAULT_PLAYBACK_SETTINGS.audioChannels).toBe('auto');
	});

	it('falls back to stereo when the browser cannot decode 5.1', () => {
		expect(resolveAudioChannels('surround', null, false)).toBe(2);
		expect(resolveAudioChannels('auto', 8, false)).toBe(2);
		expect(resolveAudioChannels('mono', null, false)).toBe(1);
	});

	it('labels the movie thresholds', () => {
		expect(minutesLabel(60)).toBe('1 hour');
		expect(minutesLabel(120)).toBe('2 hours');
		expect(minutesLabel(240)).toBe('4 hours');
	});

	it('asks after N autoplayed episodes, only when enabled', () => {
		const on = { enabled: true, episodes: 3, minutes: 120 };
		expect(stillWatchingDueForEpisode(2, on)).toBe(false);
		expect(stillWatchingDueForEpisode(3, on)).toBe(true);
		expect(stillWatchingDueForEpisode(5, { ...on, enabled: false })).toBe(false);
	});

	it('gives movies a threshold in seconds, only when enabled', () => {
		expect(stillWatchingMovieSeconds({ enabled: true, episodes: 3, minutes: 180 })).toBe(10800);
		expect(stillWatchingMovieSeconds({ enabled: false, episodes: 3, minutes: 180 })).toBeNull();
	});
});
