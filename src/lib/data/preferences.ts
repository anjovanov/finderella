/**
 * Per-profile look & feel: UI language, color theme and the idle screensaver.
 * Client-safe (the settings page, root layout and screensaver read it); stored
 * in `profile_settings`, and guests always get DEFAULT_PREFERENCES.
 */
import { labeled } from '$lib/labels';
import plural from '$lib/plural';
import { isLocale, type Locale } from './locale';

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const SCREENSAVER_KINDS = ['media', 'logo'] as const;
export type ScreensaverKind = (typeof SCREENSAVER_KINDS)[number];

export const SCREENSAVER_KIND_OPTIONS: { value: ScreensaverKind; label: string }[] = [
	labeled({ value: 'media' }, () => 'Movie & series artwork'),
	labeled({ value: 'logo' }, () => 'Logo')
];

/** Idle time before the screensaver starts, in seconds. */
export const SCREENSAVER_TIMEOUTS = [30, 60, 120, 300, 600, 900, 1800] as const;

export function timeoutLabel(seconds: number): string {
	if (seconds < 60) return plural(seconds, ['# second', '# seconds']);
	return plural(Math.round(seconds / 60), ['# minute', '# minutes']);
}

export interface ScreensaverSettings {
	enabled: boolean;
	kind: ScreensaverKind;
	seconds: number;
}

export interface Preferences {
	/** null = follow the hub's default language (admin → Site settings). */
	language: Locale | null;
	theme: Theme;
	screensaver: ScreensaverSettings;
}

export const DEFAULT_PREFERENCES: Preferences = {
	language: null,
	theme: 'dark',
	screensaver: { enabled: false, kind: 'media', seconds: 300 }
};

function oneOf<T extends string | number>(values: readonly T[], value: unknown, fallback: T): T {
	return (values as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

/** Coerce stored/posted values onto the option lists; unknown values fall back to the defaults. */
export function normalizePreferences(raw: {
	language?: unknown;
	theme?: unknown;
	screensaver?: { enabled?: unknown; kind?: unknown; seconds?: unknown };
}): Preferences {
	const fallback = DEFAULT_PREFERENCES.screensaver;
	return {
		language: isLocale(raw.language) ? raw.language : null,
		theme: oneOf(THEMES, raw.theme, DEFAULT_PREFERENCES.theme),
		screensaver: {
			enabled:
				typeof raw.screensaver?.enabled === 'boolean' ? raw.screensaver.enabled : fallback.enabled,
			kind: oneOf(SCREENSAVER_KINDS, raw.screensaver?.kind, fallback.kind),
			seconds: oneOf(SCREENSAVER_TIMEOUTS, raw.screensaver?.seconds, fallback.seconds)
		}
	};
}
