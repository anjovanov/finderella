import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeLanguage } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { userSettings } from '$lib/server/db/schema';
import {
	DEFAULT_AUDIO_LANGUAGE,
	isAudioLanguage,
	normalizeAudioLanguage
} from '$lib/audio-preference';
import {
	DEFAULT_SUBTITLE_SETTINGS,
	HEX_COLOR_RE,
	MAX_SUBTITLE_LINES,
	normalizeSubtitleSettings,
	SUBTITLE_FONTS,
	SUBTITLE_SIZES,
	type SubtitleSettings
} from '$lib/data/subtitle-settings';

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

/** The viewer's subtitle settings; guests and accounts without a row get the defaults. */
export async function getSubtitleSettings(userId: string | null): Promise<SubtitleSettings> {
	if (!userId) return DEFAULT_SUBTITLE_SETTINGS;
	const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
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

/** Merge a validated patch into the account's row (creating it) and return the result. */
export async function saveSubtitleSettings(
	userId: string,
	patch: SubtitleSettingsPatch
): Promise<SubtitleSettings> {
	const current = await getSubtitleSettings(userId);
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
		.insert(userSettings)
		.values({ userId, ...values })
		.onConflictDoUpdate({ target: userSettings.userId, set: values });
	return next;
}

export interface PlaybackSettings {
	/** 'default' (the file's default track) or an ISO 639-1 code. */
	audioLanguage: string;
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
	audioLanguage: DEFAULT_AUDIO_LANGUAGE
};

/** A partial update from the settings form or the player. */
export const PlaybackSettingsPatch = z.object({
	audioLanguage: z
		.string()
		.trim()
		.toLowerCase()
		.refine(isAudioLanguage, 'unknown language')
		.optional()
});
export type PlaybackSettingsPatch = z.infer<typeof PlaybackSettingsPatch>;

/** The viewer's playback settings; guests and accounts without a row get the defaults. */
export async function getPlaybackSettings(userId: string | null): Promise<PlaybackSettings> {
	if (!userId) return DEFAULT_PLAYBACK_SETTINGS;
	const row = await db.query.userSettings.findFirst({
		columns: { audioLanguage: true },
		where: eq(userSettings.userId, userId)
	});
	if (!row) return DEFAULT_PLAYBACK_SETTINGS;
	return { audioLanguage: normalizeAudioLanguage(row.audioLanguage) };
}

/** Merge a validated patch into the account's row (creating it) and return the result. */
export async function savePlaybackSettings(
	userId: string,
	patch: PlaybackSettingsPatch
): Promise<PlaybackSettings> {
	const current = await getPlaybackSettings(userId);
	const next: PlaybackSettings = { ...current, ...patch };
	const values = { audioLanguage: next.audioLanguage, updatedAt: new Date() };
	await db
		.insert(userSettings)
		.values({ userId, ...values })
		.onConflictDoUpdate({ target: userSettings.userId, set: values });
	return next;
}
