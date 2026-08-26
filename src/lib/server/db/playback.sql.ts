import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { agent, mediaFile } from './agents.sql';
import { episode, movie, series } from './catalog.sql';

export const playbackMode = pgEnum('playback_mode', ['direct', 'hls']);
export const playbackStatus = pgEnum('playback_status', ['active', 'stopped', 'error']);

/**
 * One playback session. The row's uuid doubles as the capability token in
 * /api/stream/[sessionId]/… URLs. Hot state lives in the in-memory
 * SessionManager; rows exist for observability and orphan cleanup at boot.
 */
export const playbackSession = pgTable('playback_session', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	mediaFileId: uuid('media_file_id')
		.notNull()
		.references(() => mediaFile.id, { onDelete: 'cascade' }),
	agentId: uuid('agent_id')
		.notNull()
		.references(() => agent.id, { onDelete: 'cascade' }),
	mode: playbackMode('mode').notNull(),
	quality: text('quality'),
	startSeconds: real('start_seconds').notNull().default(0),
	status: playbackStatus('status').notNull().default('active'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	lastAccessAt: timestamp('last_access_at', { withTimezone: true }).notNull().defaultNow(),
	stoppedAt: timestamp('stopped_at', { withTimezone: true })
});

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
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
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
