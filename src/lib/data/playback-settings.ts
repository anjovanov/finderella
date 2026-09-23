/**
 * Per-account playback settings (client-safe: the settings page, the watch
 * pages and the player read them). Stored in `user_settings`; guests get
 * DEFAULT_PLAYBACK_SETTINGS (autoplay-next remembered per browser).
 */

import { DEFAULT_AUDIO_LANGUAGE, normalizeAudioLanguage } from '$lib/audio-preference';

/** Episodes in a row, autoplayed without input, before "Still watching?". */
export const STILL_WATCHING_EPISODES = [2, 3, 4, 5, 6] as const;
/** Minutes of movie playback without input before "Still watching?". */
export const STILL_WATCHING_MINUTES = [60, 120, 180, 240] as const;

export function episodesLabel(count: number): string {
	return `${count} episodes`;
}

export function minutesLabel(minutes: number): string {
	const hours = Math.round(minutes / 60);
	return hours === 1 ? '1 hour' : `${hours} hours`;
}

export interface StillWatchingSettings {
	enabled: boolean;
	episodes: number;
	minutes: number;
}

/**
 * Most audio channels the viewer wants to hear. Transcodes are encoded down
 * to it (the gateway's `-ac`); direct play keeps the file's audio (the browser
 * downmixes to the device) except for mono, which the player downmixes itself.
 * 'auto' follows the output device (see resolveAudioChannels).
 */
export const AUDIO_CHANNEL_OPTIONS = ['auto', 'mono', 'stereo', 'surround'] as const;
export type AudioChannels = (typeof AUDIO_CHANNEL_OPTIONS)[number];

export const AUDIO_CHANNEL_LABELS: Record<AudioChannels, string> = {
	auto: 'Auto',
	mono: 'Mono',
	stereo: 'Stereo',
	surround: '5.1 surround'
};

/** Output channel counts the transcoder emits. */
export type ChannelCount = 1 | 2 | 6;

/**
 * The channel cap to request for this device. `deviceMax` is the browser's
 * reported output channel count (null when unknown); auto never picks mono,
 * and anything short of six speakers is stereo. Surround — explicit or
 * auto — falls back to stereo when the browser says it can't decode 5.1.
 */
export function resolveAudioChannels(
	setting: AudioChannels,
	deviceMax: number | null,
	surroundDecodable = true
): ChannelCount {
	switch (setting) {
		case 'mono':
			return 1;
		case 'surround':
			return surroundDecodable ? 6 : 2;
		case 'auto':
			return surroundDecodable && deviceMax !== null && deviceMax >= 6 ? 6 : 2;
		default:
			return 2;
	}
}

export interface PlaybackSettings {
	/** 'default' (the file's default track — usually the original language) or an ISO 639-1 code. */
	audioLanguage: string;
	audioChannels: AudioChannels;
	/** Start the next episode when one ends. */
	autoplayNext: boolean;
	stillWatching: StillWatchingSettings;
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
	audioLanguage: DEFAULT_AUDIO_LANGUAGE,
	audioChannels: 'auto',
	autoplayNext: true,
	stillWatching: { enabled: false, episodes: 3, minutes: 120 }
};

function oneOf<T extends number>(values: readonly T[], value: unknown, fallback: T): T {
	return (values as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/** Coerce stored/posted values onto the option lists; unknown values fall back to the defaults. */
export function normalizePlaybackSettings(raw: {
	audioLanguage?: unknown;
	audioChannels?: unknown;
	autoplayNext?: unknown;
	stillWatching?: { enabled?: unknown; episodes?: unknown; minutes?: unknown };
}): PlaybackSettings {
	const fallback = DEFAULT_PLAYBACK_SETTINGS;
	return {
		audioLanguage: normalizeAudioLanguage(raw.audioLanguage),
		audioChannels: (AUDIO_CHANNEL_OPTIONS as readonly unknown[]).includes(raw.audioChannels)
			? (raw.audioChannels as AudioChannels)
			: fallback.audioChannels,
		autoplayNext: typeof raw.autoplayNext === 'boolean' ? raw.autoplayNext : fallback.autoplayNext,
		stillWatching: {
			enabled:
				typeof raw.stillWatching?.enabled === 'boolean'
					? raw.stillWatching.enabled
					: fallback.stillWatching.enabled,
			episodes: oneOf(
				STILL_WATCHING_EPISODES,
				raw.stillWatching?.episodes,
				fallback.stillWatching.episodes
			),
			minutes: oneOf(
				STILL_WATCHING_MINUTES,
				raw.stillWatching?.minutes,
				fallback.stillWatching.minutes
			)
		}
	};
}

/** Series: ask before an episode once this many in a row autoplayed with no input. */
export function stillWatchingDueForEpisode(
	autoAdvances: number,
	settings: StillWatchingSettings
): boolean {
	return settings.enabled && autoAdvances >= settings.episodes;
}

/** Movies: seconds of playback without input after which to pause and ask; null = never. */
export function stillWatchingMovieSeconds(settings: StillWatchingSettings): number | null {
	return settings.enabled ? settings.minutes * 60 : null;
}
