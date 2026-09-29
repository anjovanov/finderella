import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * A viewer under an account (Netflix-style). Watch progress, the watchlist
 * and every preference in profile_settings belong to a profile, not to the
 * account; the session's `active_profile_id` says which one a sign-in is
 * using. Every account has exactly one primary profile, which can't be
 * deleted (see $lib/server/profiles).
 */
export const profile = pgTable(
	'profile',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** A PROFILE_COLORS key (see $lib/data/profiles). */
		avatarColor: text('avatar_color').notNull().default('teal'),
		/** A PROFILE_ICONS key; null shows the name's initial. */
		avatarIcon: text('avatar_icon'),
		isPrimary: boolean('is_primary').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('profile_user_idx').on(t.userId),
		uniqueIndex('profile_user_primary')
			.on(t.userId)
			.where(sql`${t.isPrimary}`),
		// Case-insensitive uniqueness is checked in $lib/server/profiles: drizzle-kit
		// can't diff expression indexes (a lower(name) index makes db:push re-create it forever).
		uniqueIndex('profile_user_name').on(t.userId, t.name)
	]
);

/**
 * Per-profile defaults. One row per profile, created on first save; readers
 * fall back to DEFAULT_SUBTITLE_SETTINGS / DEFAULT_PLAYBACK_SETTINGS /
 * DEFAULT_PREFERENCES when there is none. Values are validated against the
 * option lists in $lib/data/* before writing.
 */
export const profileSettings = pgTable('profile_settings', {
	profileId: uuid('profile_id')
		.primaryKey()
		.references(() => profile.id, { onDelete: 'cascade' }),
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
	/** 'auto' | 'mono' | 'stereo' | 'surround' (see AUDIO_CHANNEL_OPTIONS). */
	audioChannels: text('audio_channels').notNull().default('auto'),
	/** Start the next episode when one ends (the player's Autoplay switch). */
	autoplayNext: boolean('autoplay_next').notNull().default(true),
	/** 'show' | 'auto' | 'off' (see SKIP_MODES in $lib/data/markers). */
	skipIntro: text('skip_intro').notNull().default('show'),
	skipCredits: text('skip_credits').notNull().default('show'),
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
