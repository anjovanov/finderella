import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Hub-wide settings. A single row (`id = 'default'`), created on first read. */
export const siteSettings = pgTable('site_settings', {
	id: text('id').primaryKey().default('default'),
	allowRegistration: boolean('allow_registration').notNull().default(true),
	/** false = guests may browse and watch without an account. */
	requireLogin: boolean('require_login').notNull().default(true),
	/** Seek-bar thumbnails (trickplay): rendered on devices at first play / via the bulk job. */
	trickplayEnabled: boolean('trickplay_enabled').notNull().default(true),
	/** Render thumbnails in the background after scans (new files first, then a backfill). */
	trickplayAuto: boolean('trickplay_auto').notNull().default(true),
	/** Skip intro / Skip credits: markers served to the player and the background analysis job. */
	markersEnabled: boolean('markers_enabled').notNull().default(true),
	/** Play MKVs & co. by remuxing them in the browser (Media Source Extensions) instead of transcoding. */
	remuxEnabled: boolean('remux_enabled').notNull().default(true),
	/** Devices watch library folders and ask for a rescan when files change. */
	watchLibraries: boolean('watch_libraries').notNull().default(true),
	/** Rescan every library this often (SCAN_INTERVAL_HOURS in $lib/data/library-scanning). null = never. */
	scanIntervalHours: integer('scan_interval_hours').default(24),
	/** Signed-in devices per account; a sign-in beyond it signs out the least recently used. null = unlimited. */
	maxSessionsPerAccount: integer('max_sessions_per_account'),
	/** Profiles per account (DEFAULT_MAX_PROFILES in $lib/data/account-limits). null = unlimited. */
	maxProfilesPerAccount: integer('max_profiles_per_account').default(5),
	/** Branding (admin → Branding); ids from $lib/data/branding, read through normalizeBranding. */
	appName: text('app_name').notNull().default('Finderella'),
	/** Shown on the sign-in / sign-up pages; null = none. */
	tagline: text('tagline'),
	accent: text('accent').notNull().default('teal'),
	bodyFont: text('body_font').notNull().default('figtree'),
	headingFont: text('heading_font').notNull().default('figtree'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type SiteSettingsRow = typeof siteSettings.$inferSelect;
