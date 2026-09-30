import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Hub-wide settings. A single row (`id = 'default'`), created on first read. */
export const siteSettings = pgTable('site_settings', {
	id: text('id').primaryKey().default('default'),
	allowRegistration: boolean('allow_registration').notNull().default(true),
	/** false = guests may browse and watch without an account. */
	requireLogin: boolean('require_login').notNull().default(true),
	/** Seek-bar thumbnails (trickplay): rendered on devices at first play / via the bulk job. */
	trickplayEnabled: boolean('trickplay_enabled').notNull().default(true),
	/** Skip intro / Skip credits: markers served to the player and the background analysis job. */
	markersEnabled: boolean('markers_enabled').notNull().default(true),
	/** Play MKVs & co. by remuxing them in the browser (Media Source Extensions) instead of transcoding. */
	remuxEnabled: boolean('remux_enabled').notNull().default(true),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type SiteSettingsRow = typeof siteSettings.$inferSelect;
