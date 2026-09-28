/**
 * Account profiles (Netflix-style viewers under one sign-in). Client-safe: the
 * picker, the navbar switcher and the /profiles manager read the option lists;
 * the server stores them in the `profile` table (see $lib/server/profiles).
 */

export const MAX_PROFILES = 5;
export const PROFILE_NAME_MAX = 30;

/** Avatar backgrounds. Mid-lightness so white text/icons read in both themes. */
export const PROFILE_COLORS = [
	{ value: 'teal', label: 'Teal', css: 'oklch(0.6 0.11 205)' },
	{ value: 'sky', label: 'Sky', css: 'oklch(0.64 0.13 235)' },
	{ value: 'blue', label: 'Blue', css: 'oklch(0.56 0.15 255)' },
	{ value: 'indigo', label: 'Indigo', css: 'oklch(0.5 0.17 275)' },
	{ value: 'violet', label: 'Violet', css: 'oklch(0.55 0.17 295)' },
	{ value: 'pink', label: 'Pink', css: 'oklch(0.6 0.17 350)' },
	{ value: 'red', label: 'Red', css: 'oklch(0.57 0.18 25)' },
	{ value: 'orange', label: 'Orange', css: 'oklch(0.65 0.16 50)' },
	{ value: 'amber', label: 'Amber', css: 'oklch(0.7 0.14 80)' },
	{ value: 'lime', label: 'Lime', css: 'oklch(0.66 0.16 130)' },
	{ value: 'green', label: 'Green', css: 'oklch(0.6 0.14 150)' },
	{ value: 'slate', label: 'Slate', css: 'oklch(0.5 0.03 255)' }
] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number]['value'];
export const PROFILE_COLOR_VALUES = PROFILE_COLORS.map((c) => c.value) as ProfileColor[];
export const DEFAULT_PROFILE_COLOR: ProfileColor = 'teal';

/** Avatar icons; the icon components live in profile-avatar.svelte. null = the name's initial. */
export const PROFILE_ICONS = [
	'smile',
	'star',
	'heart',
	'crown',
	'rocket',
	'ghost',
	'cat',
	'alien',
	'robot',
	'game',
	'popcorn',
	'music',
	'panda',
	'rabbit',
	'pizza',
	'icecream',
	'football',
	'guitar',
	'rainbow',
	'flower'
] as const;
export type ProfileIcon = (typeof PROFILE_ICONS)[number];

/** Tooltip / screen-reader names for the icon picker. */
export const PROFILE_ICON_LABELS: Record<ProfileIcon, string> = {
	smile: 'Smile',
	star: 'Star',
	heart: 'Heart',
	crown: 'Crown',
	rocket: 'Rocket',
	ghost: 'Ghost',
	cat: 'Cat',
	alien: 'Alien',
	robot: 'Robot',
	game: 'Game controller',
	popcorn: 'Popcorn',
	music: 'Music',
	panda: 'Panda',
	rabbit: 'Rabbit',
	pizza: 'Pizza',
	icecream: 'Ice cream',
	football: 'Football',
	guitar: 'Guitar',
	rainbow: 'Rainbow',
	flower: 'Flower'
};

/** What the site chrome and settings pages need about a profile. */
export interface ProfileSummary {
	id: string;
	name: string;
	avatarColor: ProfileColor;
	avatarIcon: ProfileIcon | null;
	isPrimary: boolean;
}

export function isProfileColor(value: unknown): value is ProfileColor {
	return (PROFILE_COLOR_VALUES as unknown[]).includes(value);
}

export function isProfileIcon(value: unknown): value is ProfileIcon {
	return (PROFILE_ICONS as readonly unknown[]).includes(value);
}

/** Stored/posted avatar values onto the option lists (unknown color → teal, unknown icon → initial). */
export function normalizeAvatar(raw: { color?: unknown; icon?: unknown }): {
	color: ProfileColor;
	icon: ProfileIcon | null;
} {
	return {
		color: isProfileColor(raw.color) ? raw.color : DEFAULT_PROFILE_COLOR,
		icon: isProfileIcon(raw.icon) ? raw.icon : null
	};
}

export function profileColorCss(color: string): string {
	return (PROFILE_COLORS.find((c) => c.value === color) ?? PROFILE_COLORS[0]).css;
}

/** The first letter of the name, upper-cased ('?' for a blank name). */
export function profileInitial(name: string): string {
	const first = Array.from(name.trim())[0];
	return first ? first.toLocaleUpperCase() : '?';
}

/**
 * Which profile a sign-in is using. The session's stored id wins while it
 * still names one of the account's profiles; otherwise a lone profile is
 * picked automatically (`autoSelect` → the caller stores it), and with
 * several the viewer has to choose ("Who's watching?").
 */
export function pickActiveProfile<P extends { id: string }>(
	profiles: readonly P[],
	activeId: string | null | undefined
): { profile: P | null; autoSelect: boolean } {
	const stored = activeId ? profiles.find((p) => p.id === activeId) : undefined;
	if (stored) return { profile: stored, autoSelect: false };
	if (profiles.length === 1) return { profile: profiles[0], autoSelect: true };
	return { profile: null, autoSelect: false };
}

/**
 * A same-origin path to return to after picking a profile. Anything else —
 * absolute URLs, protocol-relative `//host`, backslash tricks — falls back to '/'.
 */
export function safeRedirectPath(value: unknown): string {
	if (typeof value !== 'string' || !value.startsWith('/')) return '/';
	if (value.startsWith('//') || value.includes('\\')) return '/';
	if (value === '/profiles' || value.startsWith('/profiles?')) return '/';
	return value;
}
