/**
 * The viewer's preferred audio language: 'default' (whatever the file flags
 * as its default track) or an ISO 639-1 code. Signed-in viewers keep it on
 * their account (/settings/playback, or a pick in the player); guests keep it
 * in this browser. The hub applies it when a playback session starts.
 */

import { normalizeLanguage } from '@finderella/protocol/languages';
import type { AudioTrack } from './data/types';

const STORAGE_KEY = 'finderella:audio-language';

export const DEFAULT_AUDIO_LANGUAGE = 'default';

/** 'default' or a code the language table knows; anything else is not a preference. */
export function isAudioLanguage(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		(value === DEFAULT_AUDIO_LANGUAGE || normalizeLanguage(value) === value)
	);
}

export function normalizeAudioLanguage(value: unknown): string {
	return isAudioLanguage(value) ? value : DEFAULT_AUDIO_LANGUAGE;
}

/** Remembered language in this browser, or null when nothing was picked here. */
export function loadAudioPreference(): string | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isAudioLanguage(stored) ? stored : null;
	} catch {
		return null;
	}
}

export function storeAudioPreference(language: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, language);
	} catch {
		// localStorage unavailable — the choice just isn't remembered.
	}
}

/**
 * What picking a track in the player should remember: its language, or
 * nothing when the track doesn't say (`und`) — such a pick is for this
 * session only.
 */
export function preferenceForAudioTrack(track: AudioTrack): string | null {
	return track.language !== DEFAULT_AUDIO_LANGUAGE && isAudioLanguage(track.language)
		? track.language
		: null;
}

/** Persist a player-menu choice to the signed-in viewer's account (fire and forget). */
export async function saveAudioLanguage(language: string): Promise<void> {
	try {
		await fetch('/api/settings/playback', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ audioLanguage: language })
		});
	} catch {
		// Offline or signed out — the local copy still applies for this browser.
	}
}
