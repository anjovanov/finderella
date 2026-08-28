import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, movie, series, watchProgress } from '$lib/server/db/schema';
import { getMovieBySlug, getSeriesBySlug } from '$lib/server/catalog';
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
					updatedAt: now
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
				updatedAt: now
			}
		});
	return true;
}

/** Saved resume position (seconds) for a movie, if it's worth resuming. */
export async function movieResumePosition(userId: string, slug: string): Promise<number | null> {
	const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	if (!row) return null;
	const progress = await db.query.watchProgress.findFirst({
		where: and(eq(watchProgress.userId, userId), eq(watchProgress.movieId, row.id))
	});
	if (!progress || !inProgress(progress.positionSeconds, progress.durationSeconds)) return null;
	return progress.positionSeconds;
}

/** Saved resume position (seconds) for one episode, if it's worth resuming. */
export async function episodeResumePosition(
	userId: string,
	seriesSlug: string,
	episodeSlug: string
): Promise<number | null> {
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
 * per movie/series, newest first.
 */
export async function continueWatching(userId: string, limit = 12): Promise<MediaItem[]> {
	const rows = await db.query.watchProgress.findMany({
		where: eq(watchProgress.userId, userId),
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

export interface ProgressOverlay {
	/** movie slug → fraction */
	movies: Map<string, number>;
	/** episode slug → fraction */
	episodes: Map<string, number>;
	/** series slug → the most recently watched episode and its fraction */
	series: Map<string, { fraction: number; episodeSlug: string }>;
}

/** Everything one viewer has watched, keyed by public slug (a user's rows are few). */
export async function loadProgress(userId: string): Promise<ProgressOverlay> {
	const [movieRows, episodeRows] = await Promise.all([
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
			.orderBy(desc(watchProgress.updatedAt))
	]);
	const overlay: ProgressOverlay = { movies: new Map(), episodes: new Map(), series: new Map() };
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

/** Stamp `progress` onto catalog items (and their episodes) for the cards. */
export function applyProgress<T extends MediaItem>(items: T[], overlay: ProgressOverlay): T[] {
	for (const item of items) {
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

export async function withProgress<T extends MediaItem>(userId: string, items: T[]): Promise<T[]> {
	return applyProgress(items, await loadProgress(userId));
}
