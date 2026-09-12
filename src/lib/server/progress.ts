import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, mediaFile, movie, season, series, watchProgress } from '$lib/server/db/schema';
import { bestMovieFile, getMovieBySlug, getSeriesBySlug } from '$lib/server/catalog';
import { loadWatchlistKeys, watchlistKey } from '$lib/server/watchlist';
import { inProgress, progressFraction } from '$lib/data/progress';
import type { MediaItem } from '$lib/data/types';

export async function saveProgress(input: {
	userId: string;
	kind: 'movie' | 'series';
	slug: string;
	episodeSlug?: string;
	positionSeconds: number;
	durationSeconds: number;
}): Promise<boolean> {
	const now = new Date();
	if (input.kind === 'movie') {
		const row = await db.query.movie.findFirst({ where: eq(movie.slug, input.slug) });
		if (!row) return false;
		await db
			.insert(watchProgress)
			.values({
				userId: input.userId,
				movieId: row.id,
				positionSeconds: input.positionSeconds,
				durationSeconds: input.durationSeconds,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [watchProgress.userId, watchProgress.movieId],
				// Partial unique index — the conflict target must repeat its predicate.
				targetWhere: sql`${watchProgress.movieId} is not null`,
				set: {
					positionSeconds: input.positionSeconds,
					durationSeconds: input.durationSeconds,
					updatedAt: now,
					// Playing again brings the title back into "Continue watching".
					dismissedAt: null
				}
			});
		return true;
	}
	if (!input.episodeSlug) return false;
	const seriesRow = await db.query.series.findFirst({ where: eq(series.slug, input.slug) });
	if (!seriesRow) return false;
	const episodeRow = await db.query.episode.findFirst({
		where: and(eq(episode.seriesId, seriesRow.id), eq(episode.slug, input.episodeSlug))
	});
	if (!episodeRow) return false;
	await db
		.insert(watchProgress)
		.values({
			userId: input.userId,
			episodeId: episodeRow.id,
			seriesId: seriesRow.id,
			positionSeconds: input.positionSeconds,
			durationSeconds: input.durationSeconds,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: [watchProgress.userId, watchProgress.episodeId],
			targetWhere: sql`${watchProgress.episodeId} is not null`,
			set: {
				positionSeconds: input.positionSeconds,
				durationSeconds: input.durationSeconds,
				updatedAt: now,
				dismissedAt: null
			}
		});
	return true;
}

export interface WatchState {
	positionSeconds: number;
	durationSeconds: number;
}

/** A movie's saved position + duration, only while it's worth resuming (else null). */
export async function movieWatchState(
	userId: string | null,
	slug: string
): Promise<WatchState | null> {
	if (!userId) return null;
	const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	if (!row) return null;
	const progress = await db.query.watchProgress.findFirst({
		where: and(eq(watchProgress.userId, userId), eq(watchProgress.movieId, row.id))
	});
	if (!progress || !inProgress(progress.positionSeconds, progress.durationSeconds)) return null;
	return { positionSeconds: progress.positionSeconds, durationSeconds: progress.durationSeconds };
}

/** Saved resume position (seconds) for a movie, if it's worth resuming. */
export async function movieResumePosition(
	userId: string | null,
	slug: string
): Promise<number | null> {
	return (await movieWatchState(userId, slug))?.positionSeconds ?? null;
}

/** Saved resume position (seconds) for one episode, if it's worth resuming. */
export async function episodeResumePosition(
	userId: string | null,
	seriesSlug: string,
	episodeSlug: string
): Promise<number | null> {
	if (!userId) return null;
	const seriesRow = await db.query.series.findFirst({ where: eq(series.slug, seriesSlug) });
	if (!seriesRow) return null;
	const episodeRow = await db.query.episode.findFirst({
		where: and(eq(episode.seriesId, seriesRow.id), eq(episode.slug, episodeSlug))
	});
	if (!episodeRow) return null;
	const progress = await db.query.watchProgress.findFirst({
		where: and(eq(watchProgress.userId, userId), eq(watchProgress.episodeId, episodeRow.id))
	});
	if (!progress || !inProgress(progress.positionSeconds, progress.durationSeconds)) return null;
	return progress.positionSeconds;
}

/**
 * "Continue watching" row: most recently watched in-progress titles, one entry
 * per movie/series, newest first. Titles the viewer dismissed stay hidden
 * until they play them again (`saveProgress` clears `dismissedAt`).
 */
export async function continueWatching(userId: string | null, limit = 12): Promise<MediaItem[]> {
	if (!userId) return [];
	const rows = await db.query.watchProgress.findMany({
		where: and(eq(watchProgress.userId, userId), isNull(watchProgress.dismissedAt)),
		orderBy: [desc(watchProgress.updatedAt)],
		limit: 50
	});
	const items: MediaItem[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		if (!inProgress(row.positionSeconds, row.durationSeconds)) continue;
		if (row.movieId) {
			const movieRow = await db.query.movie.findFirst({ where: eq(movie.id, row.movieId) });
			if (!movieRow || seen.has(`m:${movieRow.slug}`)) continue;
			seen.add(`m:${movieRow.slug}`);
			const item = await getMovieBySlug(movieRow.slug);
			if (item) items.push(item);
		} else if (row.seriesId) {
			const seriesRow = await db.query.series.findFirst({ where: eq(series.id, row.seriesId) });
			if (!seriesRow || seen.has(`s:${seriesRow.slug}`)) continue;
			seen.add(`s:${seriesRow.slug}`);
			const item = await getSeriesBySlug(seriesRow.slug);
			if (item) items.push(item);
		}
		if (items.length >= limit) break;
	}
	return items;
}

/**
 * Hide a title from "Continue watching" until it is played again. Progress
 * itself is kept (bars and resume positions stay). Series: every episode row.
 */
export async function dismissProgress(
	userId: string,
	kind: 'movie' | 'series',
	slug: string
): Promise<boolean> {
	const now = new Date();
	if (kind === 'movie') {
		const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
		if (!row) return false;
		await db
			.update(watchProgress)
			.set({ dismissedAt: now })
			.where(and(eq(watchProgress.userId, userId), eq(watchProgress.movieId, row.id)));
		return true;
	}
	const seriesRow = await db.query.series.findFirst({ where: eq(series.slug, slug) });
	if (!seriesRow) return false;
	await db
		.update(watchProgress)
		.set({ dismissedAt: now })
		.where(and(eq(watchProgress.userId, userId), eq(watchProgress.seriesId, seriesRow.id)));
	return true;
}

/** A finished position that `progressFraction` reports as 1 (duration must be > 0). */
function finishedSeconds(durationMs: number | null | undefined, runtimeMinutes: number): number {
	const seconds = durationMs ? durationMs / 1000 : runtimeMinutes * 60;
	return seconds > 0 ? seconds : 1;
}

/**
 * One-way "seen it": writes a finished position for the movie, or for every
 * episode of the series. Returns false when the slug is unknown or the series
 * has no episodes.
 */
export async function markWatched(
	userId: string,
	kind: 'movie' | 'series',
	slug: string
): Promise<boolean> {
	const now = new Date();
	if (kind === 'movie') {
		const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
		if (!row) return false;
		const file = await bestMovieFile(row.id);
		const seconds = finishedSeconds(file?.durationMs, row.runtimeMinutes);
		await db
			.insert(watchProgress)
			.values({
				userId,
				movieId: row.id,
				positionSeconds: seconds,
				durationSeconds: seconds,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [watchProgress.userId, watchProgress.movieId],
				targetWhere: sql`${watchProgress.movieId} is not null`,
				set: {
					positionSeconds: seconds,
					durationSeconds: seconds,
					updatedAt: now,
					dismissedAt: null
				}
			});
		return true;
	}
	const seriesRow = await db.query.series.findFirst({ where: eq(series.slug, slug) });
	if (!seriesRow) return false;
	const episodes = await db
		.select({ id: episode.id, runtimeMinutes: episode.runtimeMinutes })
		.from(episode)
		.innerJoin(season, eq(episode.seasonId, season.id))
		.where(eq(episode.seriesId, seriesRow.id))
		.orderBy(asc(season.number), asc(episode.number));
	if (episodes.length === 0) return false;
	const durations = await db
		.select({ episodeId: mediaFile.episodeId, durationMs: max(mediaFile.durationMs) })
		.from(mediaFile)
		.where(
			and(
				inArray(
					mediaFile.episodeId,
					episodes.map((e) => e.id)
				),
				eq(mediaFile.status, 'active')
			)
		)
		.groupBy(mediaFile.episodeId);
	const durationByEpisode = new Map(durations.map((d) => [d.episodeId, d.durationMs]));
	// updatedAt is staggered in episode order so the last episode is the
	// "latest" one: loadProgress reads newest-first and playTarget then falls
	// through to a fresh "Play" from the start instead of "Resume S1E1".
	const values = episodes.map((ep, i) => {
		const seconds = finishedSeconds(durationByEpisode.get(ep.id), ep.runtimeMinutes);
		return {
			userId,
			episodeId: ep.id,
			seriesId: seriesRow.id,
			positionSeconds: seconds,
			durationSeconds: seconds,
			updatedAt: new Date(now.getTime() - (episodes.length - 1 - i))
		};
	});
	await db
		.insert(watchProgress)
		.values(values)
		.onConflictDoUpdate({
			target: [watchProgress.userId, watchProgress.episodeId],
			targetWhere: sql`${watchProgress.episodeId} is not null`,
			// Multi-row upsert: each conflict must take its own row's values.
			set: {
				positionSeconds: sql`excluded.position_seconds`,
				durationSeconds: sql`excluded.duration_seconds`,
				updatedAt: sql`excluded.updated_at`,
				dismissedAt: null
			}
		});
	return true;
}

export interface ProgressOverlay {
	/** movie slug → fraction */
	movies: Map<string, number>;
	/** episode slug → fraction */
	episodes: Map<string, number>;
	/** series slug → the most recently watched episode and its fraction */
	series: Map<string, { fraction: number; episodeSlug: string }>;
	/** `watchlistKey`s of the titles the viewer saved */
	watchlist: Set<string>;
}

export function emptyProgress(): ProgressOverlay {
	return { movies: new Map(), episodes: new Map(), series: new Map(), watchlist: new Set() };
}

/**
 * Everything one viewer has done with the catalog — watch positions and
 * watchlist membership — keyed by public slug (a user's rows are few).
 * Guests (null) get an empty overlay.
 */
export async function loadProgress(userId: string | null): Promise<ProgressOverlay> {
	if (!userId) return emptyProgress();
	const [movieRows, episodeRows, watchlistKeys] = await Promise.all([
		db
			.select({
				slug: movie.slug,
				position: watchProgress.positionSeconds,
				duration: watchProgress.durationSeconds
			})
			.from(watchProgress)
			.innerJoin(movie, eq(watchProgress.movieId, movie.id))
			.where(eq(watchProgress.userId, userId)),
		db
			.select({
				episodeSlug: episode.slug,
				seriesSlug: series.slug,
				position: watchProgress.positionSeconds,
				duration: watchProgress.durationSeconds
			})
			.from(watchProgress)
			.innerJoin(episode, eq(watchProgress.episodeId, episode.id))
			.innerJoin(series, eq(episode.seriesId, series.id))
			.where(eq(watchProgress.userId, userId))
			.orderBy(desc(watchProgress.updatedAt)),
		loadWatchlistKeys(userId)
	]);
	const overlay: ProgressOverlay = { ...emptyProgress(), watchlist: watchlistKeys };
	for (const row of movieRows) {
		const fraction = progressFraction(row.position, row.duration);
		if (fraction !== undefined) overlay.movies.set(row.slug, fraction);
	}
	for (const row of episodeRows) {
		const fraction = progressFraction(row.position, row.duration);
		if (fraction === undefined) continue;
		overlay.episodes.set(row.episodeSlug, fraction);
		// Rows are newest-first: the first hit per series is the latest episode.
		if (!overlay.series.has(row.seriesSlug)) {
			overlay.series.set(row.seriesSlug, { fraction, episodeSlug: row.episodeSlug });
		}
	}
	return overlay;
}

/** Stamp `progress` (and `inWatchlist`) onto catalog items and their episodes for the cards. */
export function applyProgress<T extends MediaItem>(items: T[], overlay: ProgressOverlay): T[] {
	for (const item of items) {
		item.inWatchlist = overlay.watchlist.has(watchlistKey(item.kind, item.id));
		if (item.kind === 'movie') {
			item.progress = overlay.movies.get(item.id);
			continue;
		}
		const latest = overlay.series.get(item.id);
		item.progress = latest?.fraction;
		item.lastWatchedEpisodeId = latest?.episodeSlug;
		for (const season of item.seasons) {
			for (const ep of season.episodes) ep.progress = overlay.episodes.get(ep.id);
		}
	}
	return items;
}

export async function withProgress<T extends MediaItem>(
	userId: string | null,
	items: T[]
): Promise<T[]> {
	return applyProgress(items, await loadProgress(userId));
}
