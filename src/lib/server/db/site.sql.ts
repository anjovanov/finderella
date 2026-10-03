import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
	/** Signed-in devices per account; a sign-in beyond it signs out the least recently used. null = unlimited. */
	maxSessionsPerAccount: integer('max_sessions_per_account'),
	/** Profiles per account (DEFAULT_MAX_PROFILES in $lib/data/account-limits). null = unlimited. */
	maxProfilesPerAccount: integer('max_profiles_per_account').default(5),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type SiteSettingsRow = typeof siteSettings.$inferSelect;
