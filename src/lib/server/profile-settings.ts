import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeLanguage } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { profileSettings } from '$lib/server/db/schema';
import { isAudioLanguage } from '$lib/audio-preference';
import { SKIP_MODES } from '$lib/data/markers';
import {
	AUDIO_CHANNEL_OPTIONS,
	DEFAULT_PLAYBACK_SETTINGS,
	normalizePlaybackSettings,
	STILL_WATCHING_EPISODES,
	STILL_WATCHING_MINUTES,
	type PlaybackSettings
} from '$lib/data/playback-settings';
import {
	DEFAULT_SUBTITLE_SETTINGS,
	HEX_COLOR_RE,
	MAX_SUBTITLE_LINES,
	normalizeSubtitleSettings,
	SUBTITLE_FONTS,
	SUBTITLE_SIZES,
	type SubtitleSettings
} from '$lib/data/subtitle-settings';
import {
	DEFAULT_PREFERENCES,
	normalizePreferences,
	SCREENSAVER_KINDS,
	SCREENSAVER_TIMEOUTS,
	THEMES,
	type Preferences
} from '$lib/data/preferences';

/** A partial update from the settings form or the player (all fields optional). */
export const SubtitleSettingsPatch = z.object({
	language: z
		.string()
		.trim()
		.toLowerCase()
		.refine((code) => code === 'off' || normalizeLanguage(code) === code, 'unknown language')
		.optional(),
	size: z.enum(SUBTITLE_SIZES).optional(),
	color: z.string().trim().toLowerCase().regex(HEX_COLOR_RE, 'expected #rrggbb').optional(),
	// Forms post 'true'/'false' (hidden input behind the switch); the player API sends booleans.
	background: z
		.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
		.optional(),
	position: z.coerce.number().int().min(0).max(MAX_SUBTITLE_LINES).optional(),
	font: z.enum(SUBTITLE_FONTS).optional()
});
export type SubtitleSettingsPatch = z.infer<typeof SubtitleSettingsPatch>;

/** The viewer's subtitle settings; guests, profile-less sign-ins and profiles without a row get the defaults. */
export async function getSubtitleSettings(profileId: string | null): Promise<SubtitleSettings> {
	if (!profileId) return DEFAULT_SUBTITLE_SETTINGS;
	const row = await db.query.profileSettings.findFirst({
		where: eq(profileSettings.profileId, profileId)
	});
	if (!row) return DEFAULT_SUBTITLE_SETTINGS;
	return normalizeSubtitleSettings({
		language: row.subtitleLanguage,
		size: row.subtitleSize,
		color: row.subtitleColor,
		background: row.subtitleBackground,
		position: row.subtitlePosition,
		font: row.subtitleFont
	});
}

/** Merge a validated patch into the profile's row (creating it) and return the result. */
export async function saveSubtitleSettings(
	profileId: string,
	patch: SubtitleSettingsPatch
): Promise<SubtitleSettings> {
	const current = await getSubtitleSettings(profileId);
	const next = normalizeSubtitleSettings({ ...current, ...patch });
	const now = new Date();
	const values = {
		subtitleLanguage: next.language,
		subtitleSize: next.size,
		subtitleColor: next.color,
		subtitleBackground: next.background,
		subtitlePosition: next.position,
		subtitleFont: next.font,
		updatedAt: now
	};
	await db
		.insert(profileSettings)
		.values({ profileId, ...values })
		.onConflictDoUpdate({ target: profileSettings.profileId, set: values });
	return next;
}

/** Forms post 'true'/'false' for switches (hidden input behind the Switch). */
const formBoolean = z.union([
	z.boolean(),
	z.enum(['true', 'false']).transform((v) => v === 'true')
]);

/** A partial update from the settings forms or the player (all fields optional). */
export const PlaybackSettingsPatch = z.object({
	audioLanguage: z
		.string()
		.trim()
		.toLowerCase()
		.refine(isAudioLanguage, 'unknown language')
		.optional(),
	audioChannels: z.enum(AUDIO_CHANNEL_OPTIONS).optional(),
	autoplayNext: formBoolean.optional(),
	skipIntro: z.enum(SKIP_MODES).optional(),
	skipCredits: z.enum(SKIP_MODES).optional(),
	stillWatchingEnabled: formBoolean.optional(),
	stillWatchingEpisodes: z.coerce
		.number()
		.int()
		.refine((n) => (STILL_WATCHING_EPISODES as readonly number[]).includes(n), 'unknown count')
		.optional(),
	stillWatchingMinutes: z.coerce
		.number()
		.int()
		.refine((n) => (STILL_WATCHING_MINUTES as readonly number[]).includes(n), 'unknown duration')
		.optional()
});
export type PlaybackSettingsPatch = z.infer<typeof PlaybackSettingsPatch>;

/** The viewer's playback settings; guests, profile-less sign-ins and profiles without a row get the defaults. */
export async function getPlaybackSettings(profileId: string | null): Promise<PlaybackSettings> {
	if (!profileId) return DEFAULT_PLAYBACK_SETTINGS;
	const row = await db.query.profileSettings.findFirst({
		columns: {
			audioLanguage: true,
			audioChannels: true,
			autoplayNext: true,
			skipIntro: true,
			skipCredits: true,
			stillWatchingEnabled: true,
			stillWatchingEpisodes: true,
			stillWatchingMinutes: true
		},
		where: eq(profileSettings.profileId, profileId)
	});
	if (!row) return DEFAULT_PLAYBACK_SETTINGS;
	return normalizePlaybackSettings({
		audioLanguage: row.audioLanguage,
		audioChannels: row.audioChannels,
		autoplayNext: row.autoplayNext,
		skipIntro: row.skipIntro,
		skipCredits: row.skipCredits,
		stillWatching: {
			enabled: row.stillWatchingEnabled,
			episodes: row.stillWatchingEpisodes,
			minutes: row.stillWatchingMinutes
		}
	});
}

/** Merge a validated patch into the profile's row (creating it) and return the result. */
export async function savePlaybackSettings(
	profileId: string,
	patch: PlaybackSettingsPatch
): Promise<PlaybackSettings> {
	const current = await getPlaybackSettings(profileId);
	const next = normalizePlaybackSettings({
		audioLanguage: patch.audioLanguage ?? current.audioLanguage,
		audioChannels: patch.audioChannels ?? current.audioChannels,
		autoplayNext: patch.autoplayNext ?? current.autoplayNext,
		skipIntro: patch.skipIntro ?? current.skipIntro,
		skipCredits: patch.skipCredits ?? current.skipCredits,
		stillWatching: {
			enabled: patch.stillWatchingEnabled ?? current.stillWatching.enabled,
			episodes: patch.stillWatchingEpisodes ?? current.stillWatching.episodes,
			minutes: patch.stillWatchingMinutes ?? current.stillWatching.minutes
		}
	});
	const values = {
		audioLanguage: next.audioLanguage,
		audioChannels: next.audioChannels,
		autoplayNext: next.autoplayNext,
		skipIntro: next.skipIntro,
		skipCredits: next.skipCredits,
		stillWatchingEnabled: next.stillWatching.enabled,
		stillWatchingEpisodes: next.stillWatching.episodes,
		stillWatchingMinutes: next.stillWatching.minutes,
		updatedAt: new Date()
	};
	await db
		.insert(profileSettings)
		.values({ profileId, ...values })
		.onConflictDoUpdate({ target: profileSettings.profileId, set: values });
	return next;
}

/** A partial update from one of the /settings/preferences forms. */
export const PreferencesPatch = z.object({
	theme: z.enum(THEMES).optional(),
	screensaverEnabled: formBoolean.optional(),
	screensaverKind: z.enum(SCREENSAVER_KINDS).optional(),
	screensaverSeconds: z.coerce
		.number()
		.int()
		.refine((n) => (SCREENSAVER_TIMEOUTS as readonly number[]).includes(n), 'unknown timeout')
		.optional()
});
export type PreferencesPatch = z.infer<typeof PreferencesPatch>;

/** The viewer's theme + screensaver settings; guests, profile-less sign-ins and profiles without a row get the defaults. */
export async function getPreferences(profileId: string | null): Promise<Preferences> {
	if (!profileId) return DEFAULT_PREFERENCES;
	const row = await db.query.profileSettings.findFirst({
		columns: {
			theme: true,
			screensaverEnabled: true,
			screensaverKind: true,
			screensaverSeconds: true
		},
		where: eq(profileSettings.profileId, profileId)
	});
	if (!row) return DEFAULT_PREFERENCES;
	return normalizePreferences({
		theme: row.theme,
		screensaver: {
			enabled: row.screensaverEnabled,
			kind: row.screensaverKind,
			seconds: row.screensaverSeconds
		}
	});
}

/** Merge a validated patch into the profile's row (creating it) and return the result. */
export async function savePreferences(
	profileId: string,
	patch: PreferencesPatch
): Promise<Preferences> {
	const current = await getPreferences(profileId);
	const next = normalizePreferences({
		theme: patch.theme ?? current.theme,
		screensaver: {
			enabled: patch.screensaverEnabled ?? current.screensaver.enabled,
			kind: patch.screensaverKind ?? current.screensaver.kind,
			seconds: patch.screensaverSeconds ?? current.screensaver.seconds
		}
	});
	const values = {
		theme: next.theme,
		screensaverEnabled: next.screensaver.enabled,
		screensaverKind: next.screensaver.kind,
		screensaverSeconds: next.screensaver.seconds,
		updatedAt: new Date()
	};
	await db
		.insert(profileSettings)
		.values({ profileId, ...values })
		.onConflictDoUpdate({ target: profileSettings.profileId, set: values });
	return next;
}
