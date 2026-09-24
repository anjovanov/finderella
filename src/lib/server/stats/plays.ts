import { and, desc, eq, gt, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	episode,
	movie,
	playbackSession,
	playHistory,
	season,
	series
} from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import type { MediaFileRow } from '$lib/server/streaming/compat';
import type { HotSession } from '$lib/server/streaming/session-manager';
import { MIN_PLAY_SECONDS } from '$lib/data/stats';
import { canContinuePlay, CONTINUE_WINDOW_MS } from './accounting';

/**
 * Watch-history rows for playback sessions (DB side of ./accounting). Every
 * function here is best effort: history must never break playback, so errors
 * are logged and swallowed.
 */

/** Heartbeats write the row at most this often; stop always writes. */
export const FLUSH_EVERY_MS = 30_000;

interface TitleSnapshot {
	kind: 'movie' | 'episode';
	movieId: string | null;
	episodeId: string | null;
	seriesId: string | null;
	title: string;
	seriesTitle: string | null;
	seasonNumber: number | null;
	episodeNumber: number | null;
	year: number | null;
}

async function titleSnapshot(file: MediaFileRow): Promise<TitleSnapshot | null> {
	if (file.movieId) {
		const row = await db.query.movie.findFirst({
			where: eq(movie.id, file.movieId),
			columns: { title: true, year: true }
		});
		if (!row) return null;
		return {
			kind: 'movie',
			movieId: file.movieId,
			episodeId: null,
			seriesId: null,
			title: row.title,
			seriesTitle: null,
			seasonNumber: null,
			episodeNumber: null,
			year: row.year
		};
	}
	if (!file.episodeId) return null;
	const [row] = await db
		.select({
			title: episode.title,
			number: episode.number,
			seriesId: episode.seriesId,
			seasonNumber: season.number,
			seriesTitle: series.title,
			year: series.year
		})
		.from(episode)
		.innerJoin(season, eq(season.id, episode.seasonId))
		.innerJoin(series, eq(series.id, episode.seriesId))
		.where(eq(episode.id, file.episodeId))
		.limit(1);
	if (!row) return null;
	return {
		kind: 'episode',
		movieId: null,
		episodeId: file.episodeId,
		seriesId: row.seriesId,
		title: row.title,
		seriesTitle: row.seriesTitle,
		seasonNumber: row.seasonNumber,
		episodeNumber: row.number,
		year: row.year
	};
}

/** The viewer's recent row for the same title, if this session continues it. */
async function continuableRow(session: HotSession, snap: TitleSnapshot, now: number) {
	const [row] = await db
		.select({
			id: playHistory.id,
			userId: playHistory.userId,
			userAgent: playHistory.userAgent,
			movieId: playHistory.movieId,
			episodeId: playHistory.episodeId,
			lastActiveAt: playHistory.lastActiveAt
		})
		.from(playHistory)
		.where(
			and(
				session.userId ? eq(playHistory.userId, session.userId) : isNull(playHistory.userId),
				// Guests are told apart by browser only.
				session.userId || !session.userAgent
					? undefined
					: eq(playHistory.userAgent, session.userAgent),
				snap.movieId
					? eq(playHistory.movieId, snap.movieId)
					: eq(playHistory.episodeId, snap.episodeId!),
				gt(playHistory.lastActiveAt, new Date(now - CONTINUE_WINDOW_MS))
			)
		)
		.orderBy(desc(playHistory.lastActiveAt))
		.limit(1);
	const identity = {
		userId: session.userId,
		userAgent: session.userAgent,
		movieId: snap.movieId,
		episodeId: snap.episodeId
	};
	return row && canContinuePlay(row, identity, now) ? row : null;
}

/**
 * Attach a history row to a freshly started session: continue the viewer's
 * recent row for the same title, or open a new one. Sets `session.historyId`.
 */
export async function openPlay(session: HotSession): Promise<void> {
	try {
		const file = session.source.file;
		const snap = await titleSnapshot(file);
		if (!snap) return;
		const now = Date.now();
		const current = {
			mediaFileId: file.id,
			libraryId: file.libraryId,
			gatewayId: session.source.gatewayId,
			mode: session.mode,
			quality: session.quality,
			sourceWidth: file.width,
			sourceHeight: file.height,
			videoCodec: file.videoCodec,
			audioCodec: file.audioCodec,
			userAgent: session.userAgent,
			browser: session.platform.browser,
			browserVersion: session.platform.browserVersion,
			os: session.platform.os,
			deviceType: session.platform.deviceType,
			lastActiveAt: new Date(now),
			stoppedAt: null
		};

		const recent = await continuableRow(session, snap, now);
		if (recent) {
			session.historyId = recent.id;
			const [updated] = await db
				.update(playHistory)
				.set({
					...current,
					transcoded: sql`${playHistory.transcoded} or ${session.mode === 'hls'}`
				})
				.where(eq(playHistory.id, recent.id))
				.returning({ id: playHistory.id });
			// Deleted meanwhile (a sub-minimum row closed by the session this one replaces).
			if (!updated) session.historyId = null;
		}
		if (!session.historyId) {
			const [inserted] = await db
				.insert(playHistory)
				.values({
					...snap,
					...current,
					userId: session.userId,
					startedAt: new Date(now),
					startPosition: session.startSeconds,
					positionSeconds: session.startSeconds,
					durationSeconds: file.durationMs ? file.durationMs / 1000 : null,
					transcoded: session.mode === 'hls'
				})
				.returning({ id: playHistory.id });
			session.historyId = inserted.id;
		}
		await db
			.update(playbackSession)
			.set({ historyId: session.historyId })
			.where(eq(playbackSession.id, session.id));
	} catch (err) {
		log.warn({ err, sessionId: session.id }, 'could not open play history');
	}
}

/** Write the session's accumulated deltas (time, bytes) and latest position to its row. */
export async function flushPlay(session: HotSession, now: number): Promise<void> {
	if (!session.historyId) return;
	const played = session.live.played - session.flushed.played;
	const paused = session.live.paused - session.flushed.paused;
	const bytes = session.bytesSent - session.flushed.bytes;
	session.flushed = {
		played: session.live.played,
		paused: session.live.paused,
		bytes: session.bytesSent
	};
	session.lastFlushAt = now;
	try {
		await db
			.update(playHistory)
			.set({
				playedSeconds: sql`${playHistory.playedSeconds} + ${played}`,
				pausedSeconds: sql`${playHistory.pausedSeconds} + ${paused}`,
				bytesSent: sql`${playHistory.bytesSent} + ${bytes}`,
				positionSeconds: session.live.positionSeconds,
				...(session.live.durationSeconds ? { durationSeconds: session.live.durationSeconds } : {}),
				lastActiveAt: new Date(now)
			})
			.where(eq(playHistory.id, session.historyId));
	} catch (err) {
		log.warn({ err, sessionId: session.id }, 'could not update play history');
	}
}

/**
 * Final write for a stopping session. `shared` = another live session still
 * feeds the same row (a quality switch whose new session started first): leave
 * it open. Otherwise stamp `stopped_at`, or drop the row when it never reached
 * MIN_PLAY_SECONDS of playing time.
 */
export async function closePlay(session: HotSession, now: number, shared: boolean): Promise<void> {
	await flushPlay(session, now);
	if (!session.historyId || shared) return;
	try {
		const [dropped] = await db
			.delete(playHistory)
			.where(
				and(eq(playHistory.id, session.historyId), lt(playHistory.playedSeconds, MIN_PLAY_SECONDS))
			)
			.returning({ id: playHistory.id });
		if (dropped) return;
		await db
			.update(playHistory)
			.set({ stoppedAt: new Date(now) })
			.where(eq(playHistory.id, session.historyId));
	} catch (err) {
		log.warn({ err, sessionId: session.id }, 'could not close play history');
	}
}

/**
 * Boot-time cleanup: rows a previous process left open end at their last
 * activity (or go, under the minimum). `liveIds` = rows live sessions of this
 * process still feed.
 */
export async function closeOrphanPlays(liveIds: string[] = []): Promise<void> {
	const open = and(
		isNull(playHistory.stoppedAt),
		liveIds.length ? notInArray(playHistory.id, liveIds) : undefined
	);
	await db.delete(playHistory).where(and(open, lt(playHistory.playedSeconds, MIN_PLAY_SECONDS)));
	await db
		.update(playHistory)
		.set({ stoppedAt: sql`${playHistory.lastActiveAt}` })
		.where(open);
}
