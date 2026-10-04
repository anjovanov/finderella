import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Metadata (TMDB) configuration — a single row (`id = 'default'`) edited on
 * /admin/settings. Kept out of `site_settings`, which every request reads,
 * so the key can't ride along with it into page data. The key is stored as
 * entered; the admin page only ever shows its last characters.
 */
export const metadataSettings = pgTable('metadata_settings', {
	id: text('id').primaryKey().default('default'),
	/** Overrides TMDB_API_KEY from the environment when set. */
	tmdbApiKey: text('tmdb_api_key'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type MetadataSettingsRow = typeof metadataSettings.$inferSelect;
