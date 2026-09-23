import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * Per-account defaults. One row per user, created on first save; readers fall
 * back to DEFAULT_SUBTITLE_SETTINGS / DEFAULT_PLAYBACK_SETTINGS / DEFAULT_PREFERENCES
 * when there is none. Values are validated
 * against the option lists in $lib/data/subtitle-settings before writing.
 */
export const userSettings = pgTable('user_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	/** 'off' or an ISO 639-1 code. */
	subtitleLanguage: text('subtitle_language').notNull().default('en'),
	subtitleSize: text('subtitle_size').notNull().default('medium'),
	subtitleColor: text('subtitle_color').notNull().default('#ffffff'),
	subtitleBackground: boolean('subtitle_background').notNull().default(true),
	/** Cue lines above the bottom edge (0..MAX_SUBTITLE_LINES). */
	subtitlePosition: integer('subtitle_position').notNull().default(2),
	subtitleFont: text('subtitle_font').notNull().default('sans'),
	/** 'default' (the file's default track) or an ISO 639-1 code. */
	audioLanguage: text('audio_language').notNull().default('default'),
	/** Start the next episode when one ends (the player's Autoplay switch). */
	autoplayNext: boolean('autoplay_next').notNull().default(true),
	/** "Still watching?" prompt; thresholds are STILL_WATCHING_EPISODES / _MINUTES presets. */
	stillWatchingEnabled: boolean('still_watching_enabled').notNull().default(false),
	stillWatchingEpisodes: integer('still_watching_episodes').notNull().default(3),
	stillWatchingMinutes: integer('still_watching_minutes').notNull().default(120),
	/** 'dark' | 'light' (see $lib/data/preferences). */
	theme: text('theme').notNull().default('dark'),
	screensaverEnabled: boolean('screensaver_enabled').notNull().default(false),
	/** 'media' (backdrop slideshow) | 'logo'. */
	screensaverKind: text('screensaver_kind').notNull().default('media'),
	/** Idle seconds before it starts; one of SCREENSAVER_TIMEOUTS. */
	screensaverSeconds: integer('screensaver_seconds').notNull().default(300),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
