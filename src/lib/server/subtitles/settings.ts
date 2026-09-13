import { eq } from 'drizzle-orm';
import { normalizeLanguage } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { subtitleSettings, type SubtitleSettingsRow } from '$lib/server/db/schema';
import type { SubtitleProviderId } from './providers/types';

export type SubtitleProviderSettings = SubtitleSettingsRow;
export type SubtitleProviderSettingsPatch = Partial<
	Pick<
		SubtitleSettingsRow,
		| 'opensubtitlesApiKey'
		| 'opensubtitlesUsername'
		| 'opensubtitlesPassword'
		| 'subdlApiKey'
		| 'gestdownEnabled'
		| 'titloviUsername'
		| 'titloviPassword'
		| 'languages'
		| 'autoDownload'
		| 'preferHearingImpaired'
	>
>;

const CACHE_TTL_MS = 5_000;
let cached: { value: SubtitleProviderSettings; expiresAt: number } | null = null;

/** The singleton row, created on first read; cached briefly (the bulk job reads it per item). */
export async function getSubtitleProviderSettings(): Promise<SubtitleProviderSettings> {
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	let row = await db.query.subtitleSettings.findFirst({
		where: eq(subtitleSettings.id, 'default')
	});
	if (!row) {
		[row] = await db
			.insert(subtitleSettings)
			.values({ id: 'default' })
			.onConflictDoNothing()
			.returning();
		row ??= (await db.query.subtitleSettings.findFirst({
			where: eq(subtitleSettings.id, 'default')
		}))!;
	}
	cached = { value: row, expiresAt: Date.now() + CACHE_TTL_MS };
	return row;
}

export async function updateSubtitleProviderSettings(
	patch: SubtitleProviderSettingsPatch
): Promise<SubtitleProviderSettings> {
	await getSubtitleProviderSettings();
	cached = null;
	const [updated] = await db
		.update(subtitleSettings)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(subtitleSettings.id, 'default'))
		.returning();
	cached = { value: updated, expiresAt: Date.now() + CACHE_TTL_MS };
	return updated;
}

/** Providers with a key on file, in preference order. */
export function configuredProviders(settings: SubtitleProviderSettings): SubtitleProviderId[] {
	const out: SubtitleProviderId[] = [];
	if (settings.opensubtitlesApiKey?.trim()) out.push('opensubtitles');
	if (settings.subdlApiKey?.trim()) out.push('subdl');
	if (settings.gestdownEnabled) out.push('gestdown');
	if (settings.titloviUsername?.trim() && settings.titloviPassword) out.push('titlovi');
	return out;
}

/** Whether any provider can be searched at all (drives the player's "Find subtitles" row). */
export async function subtitleProvidersConfigured(): Promise<boolean> {
	return configuredProviders(await getSubtitleProviderSettings()).length > 0;
}

/** The comma list of languages bulk/auto downloads want, normalized and deduplicated. */
export function parseLanguageList(list: string | null | undefined): string[] {
	const out: string[] = [];
	for (const token of (list ?? '').split(',')) {
		const code = normalizeLanguage(token.trim());
		if (code && !out.includes(code)) out.push(code);
	}
	return out;
}
