import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { gateway, library, mediaFile } from './gateways.sql';
import { episode, movie, series } from './catalog.sql';

export const playbackMode = pgEnum('playback_mode', ['direct', 'hls']);
export const playbackStatus = pgEnum('playback_status', ['active', 'stopped', 'error']);
export const playKind = pgEnum('play_kind', ['movie', 'episode']);

/**
 * Watch history: one row per viewing (admin statistics). A viewing can span
 * several playback sessions — quality/audio switches and reloads within a few
 * minutes continue the same row (see $lib/server/stats/plays). Title fields are
 * snapshots so history survives a catalog prune; the FKs only link while the
 * rows exist. Rows under MIN_PLAY_SECONDS of playing time are dropped on close.
 */
export const playHistory = pgTable(
	'play_history',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// null = a guest viewer; history goes with its account.
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		kind: playKind('kind').notNull(),
		movieId: uuid('movie_id').references(() => movie.id, { onDelete: 'set null' }),
		episodeId: uuid('episode_id').references(() => episode.id, { onDelete: 'set null' }),
		seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
		mediaFileId: uuid('media_file_id').references(() => mediaFile.id, { onDelete: 'set null' }),
		libraryId: uuid('library_id').references(() => library.id, { onDelete: 'set null' }),
		gatewayId: uuid('gateway_id').references(() => gateway.id, { onDelete: 'set null' }),
		/** Movie title, or the episode title for an episode. */
		title: text('title').notNull(),
		seriesTitle: text('series_title'),
		seasonNumber: integer('season_number'),
		episodeNumber: integer('episode_number'),
		year: integer('year'),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
		stoppedAt: timestamp('stopped_at', { withTimezone: true }),
		/** Wall-clock seconds spent playing / paused, from player heartbeats. */
		playedSeconds: real('played_seconds').notNull().default(0),
		pausedSeconds: real('paused_seconds').notNull().default(0),
		startPosition: real('start_position').notNull().default(0),
		positionSeconds: real('position_seconds').notNull().default(0),
		durationSeconds: real('duration_seconds'),
		/** The latest session's mode; `transcoded` sticks once any session was HLS. */
		mode: playbackMode('mode').notNull(),
		transcoded: boolean('transcoded').notNull().default(false),
		quality: text('quality'),
		sourceWidth: integer('source_width'),
		sourceHeight: integer('source_height'),
		videoCodec: text('video_codec'),
		audioCodec: text('audio_codec'),
		bytesSent: bigint('bytes_sent', { mode: 'number' }).notNull().default(0),
		userAgent: text('user_agent'),
		browser: text('browser'),
		browserVersion: text('browser_version'),
		os: text('os'),
		/** 'desktop' | 'mobile' | 'tablet' | 'tv' | 'unknown' */
		deviceType: text('device_type').notNull().default('unknown')
	},
	(t) => [
		index('play_history_started_idx').on(t.startedAt),
		index('play_history_user_started_idx').on(t.userId, t.startedAt),
		index('play_history_movie_idx').on(t.movieId),
		index('play_history_series_idx').on(t.seriesId)
	]
);

/**
 * One playback session. The row's uuid doubles as the capability token in
 * /api/stream/[sessionId]/… URLs. Hot state lives in the in-memory
 * SessionManager; rows exist for observability and orphan cleanup at boot.
 */
export const playbackSession = pgTable(
	'playback_session',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		// null = a guest viewer (public access mode); the row is still reaped normally.
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		mediaFileId: uuid('media_file_id')
			.notNull()
			.references(() => mediaFile.id, { onDelete: 'cascade' }),
		gatewayId: uuid('gateway_id')
			.notNull()
			.references(() => gateway.id, { onDelete: 'cascade' }),
		mode: playbackMode('mode').notNull(),
		quality: text('quality'),
		startSeconds: real('start_seconds').notNull().default(0),
		status: playbackStatus('status').notNull().default('active'),
		/** 'client' | 'idle' | 'error' | 'admin' */
		stopReason: text('stop_reason'),
		historyId: uuid('history_id').references(() => playHistory.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastAccessAt: timestamp('last_access_at', { withTimezone: true }).notNull().defaultNow(),
		stoppedAt: timestamp('stopped_at', { withTimezone: true })
	},
	(t) => [index('playback_session_status_idx').on(t.status)]
);

/** Per-user watch position; one row per movie / per episode. */
export const watchProgress = pgTable(
	'watch_progress',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		movieId: uuid('movie_id').references(() => movie.id, { onDelete: 'cascade' }),
		episodeId: uuid('episode_id').references(() => episode.id, { onDelete: 'cascade' }),
		// Denormalized so "continue watching" can collapse a series to one row.
		seriesId: uuid('series_id').references(() => series.id, { onDelete: 'cascade' }),
		positionSeconds: real('position_seconds').notNull(),
		durationSeconds: real('duration_seconds').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		// Set when the viewer removed the title from "Continue watching"; cleared by the next playback.
		dismissedAt: timestamp('dismissed_at', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('watch_progress_user_movie')
			.on(t.userId, t.movieId)
			.where(sql`${t.movieId} is not null`),
		uniqueIndex('watch_progress_user_episode')
			.on(t.userId, t.episodeId)
			.where(sql`${t.episodeId} is not null`)
	]
);
