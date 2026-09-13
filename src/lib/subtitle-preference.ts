/**
 * The viewer's remembered subtitle choice (browser only): 'off', or the
 * ISO 639-1 language they last picked. Applied whenever a player mounts —
 * the next episode, a quality restart, another title. Until they pick,
 * English subtitles are on whenever the title has them.
 */

import { normalizeLanguage } from '@finderella/protocol/languages';
import type { SubtitleTrack } from './data/types';

const STORAGE_KEY = 'finderella:subtitles';

/** A code the language table knows — `und` and stray values are not preferences. */
export function isKnownLanguage(code: string | null | undefined): code is string {
	return !!code && normalizeLanguage(code) === code;
}

export type SubtitlePreference = 'off' | { language: string };

/** Remembered choice, or null when the viewer never picked anything. */
export function loadSubtitlePreference(): SubtitlePreference | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;
		if (stored === 'off') return 'off';
		return isKnownLanguage(stored) ? { language: stored } : null;
	} catch {
		return null;
	}
}

export function storeSubtitlePreference(preference: SubtitlePreference): void {
	try {
		localStorage.setItem(STORAGE_KEY, preference === 'off' ? 'off' : preference.language);
	} catch {
		// localStorage unavailable — the choice just isn't remembered.
	}
}

/** Shown when the viewer has never picked a language. */
export const DEFAULT_SUBTITLE_LANGUAGE = 'en';

/** The settings value ('off' or a code) as a preference. */
export function preferenceFromLanguage(language: string): SubtitlePreference {
	return language === 'off' ? 'off' : { language };
}

/**
 * What picking a track in the player should remember: its language, or
 * nothing when the track doesn't say (`Track 1`, srclang `und`) — such a pick
 * is for this session only and must not overwrite the viewer's language.
 * Turning subtitles off (null) is always remembered.
 */
export function preferenceForTrack(track: SubtitleTrack | null): SubtitlePreference | null {
	if (!track) return 'off';
	return isKnownLanguage(track.srclang) ? { language: track.srclang } : null;
}

/** Persist a player-menu choice to the signed-in viewer's account (fire and forget). */
export async function saveSubtitleLanguage(preference: SubtitlePreference): Promise<void> {
	try {
		await fetch('/api/settings/subtitles', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ language: preference === 'off' ? 'off' : preference.language })
		});
	} catch {
		// Offline or signed out — the local copy still applies for this browser.
	}
}

/** The plain (non-forced, non-SDH) track in a language, else SDH, else forced. */
function trackInLanguage(tracks: SubtitleTrack[], language: string): SubtitleTrack | null {
	const inLanguage = tracks.filter((t) => t.srclang === language);
	return (
		inLanguage.find((t) => !t.forced && t.kind === 'subtitles') ??
		inLanguage.find((t) => !t.forced) ??
		inLanguage[0] ??
		null
	);
}

/**
 * Which track to show for a title: the plain (non-forced, non-SDH) track in
 * the preferred language, else SDH, else forced; when the title has nothing
 * in that language, the container's default track. No preference means
 * English; 'off' → none.
 */
export function pickSubtitleTrack(
	tracks: SubtitleTrack[],
	preference: SubtitlePreference | null
): SubtitleTrack | null {
	if (preference === 'off') return null;
	const language = preference ? preference.language : DEFAULT_SUBTITLE_LANGUAGE;
	return trackInLanguage(tracks, language) ?? tracks.find((t) => t.default) ?? null;
}
