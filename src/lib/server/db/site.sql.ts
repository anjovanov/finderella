import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Hub-wide settings. A single row (`id = 'default'`), created on first read. */
export const siteSettings = pgTable('site_settings', {
	id: text('id').primaryKey().default('default'),
	allowRegistration: boolean('allow_registration').notNull().default(true),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type SiteSettingsRow = typeof siteSettings.$inferSelect;
