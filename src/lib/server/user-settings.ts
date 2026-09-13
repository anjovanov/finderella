import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeLanguage } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { userSettings } from '$lib/server/db/schema';
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
