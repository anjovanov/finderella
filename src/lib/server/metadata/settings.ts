import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { metadataSettings, type MetadataSettingsRow } from '$lib/server/db/schema';

export type MetadataSettingsPatch = Partial<Pick<MetadataSettingsRow, 'tmdbApiKey'>>;

/** Where the TMDB key in use comes from: saved on /admin/settings, or TMDB_API_KEY. */
export type TmdbKeySource = 'dashboard' | 'env';

// Every TMDB request resolves the key; the hub is single-process, so a short
// in-memory cache (replaced on update) is safe.
const CACHE_TTL_MS = 5_000;
let cached: { value: MetadataSettingsRow; expiresAt: number } | null = null;

/** The singleton row, created on first read. */
export async function getMetadataSettings(): Promise<MetadataSettingsRow> {
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	let row = await db.query.metadataSettings.findFirst({
		where: eq(metadataSettings.id, 'default')
	});
	if (!row) {
		[row] = await db
			.insert(metadataSettings)
			.values({ id: 'default' })
			.onConflictDoNothing()
			.returning();
		row ??= (await db.query.metadataSettings.findFirst({
			where: eq(metadataSettings.id, 'default')
		}))!;
	}
	cached = { value: row, expiresAt: Date.now() + CACHE_TTL_MS };
	return row;
}

export async function updateMetadataSettings(
	patch: MetadataSettingsPatch
): Promise<MetadataSettingsRow> {
	await getMetadataSettings();
	cached = null;
	const [updated] = await db
		.update(metadataSettings)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(metadataSettings.id, 'default'))
		.returning();
	cached = { value: updated, expiresAt: Date.now() + CACHE_TTL_MS };
	return updated;
}

/** The TMDB key to use: the one saved by an admin wins over TMDB_API_KEY. null = not configured. */
export async function tmdbCredentials(): Promise<{ key: string; source: TmdbKeySource } | null> {
	const saved = (await getMetadataSettings()).tmdbApiKey?.trim();
	if (saved) return { key: saved, source: 'dashboard' };
	const fromEnv = env.TMDB_API_KEY?.trim();
	if (fromEnv) return { key: fromEnv, source: 'env' };
	return null;
}
