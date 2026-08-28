import { count, eq, notExists } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, mediaFile, movie, season, series } from '$lib/server/db/schema';
import { log } from '$lib/server/log';

/**
 * Titles exist only because a scanned file linked to them (ingest is
 * find-or-create by slug and never deletes). Once every file of a title is
 * gone — library removed, gateway revoked, or a legacy seeded placeholder —
 * the row is an orphan the UI can never play. Prune removes those.
 *
 * A title is kept while it has ANY media_file row, `active` or `missing`:
 * `missing` only comes from a completed scan that didn't see the file, so a
 * temporarily offline device never costs anyone a title or its watch
 * progress (which cascades from movie/episode/series).
 */

export interface PruneResult {
	movies: number;
	series: number;
	episodes: number;
}

const movieHasNoFiles = notExists(
	db.select({ id: mediaFile.id }).from(mediaFile).where(eq(mediaFile.movieId, movie.id))
);
const episodeHasNoFiles = notExists(
	db.select({ id: mediaFile.id }).from(mediaFile).where(eq(mediaFile.episodeId, episode.id))
);
const seasonHasNoEpisodes = notExists(
	db.select({ id: episode.id }).from(episode).where(eq(episode.seasonId, season.id))
);
const seriesHasNoEpisodes = notExists(
	db.select({ id: episode.id }).from(episode).where(eq(episode.seriesId, series.id))
);

/** How many titles a prune would remove right now (settings page). */
export async function countOrphans(): Promise<{ movies: number; series: number }> {
	const [[movies], [seriesRows]] = await Promise.all([
		db.select({ n: count() }).from(movie).where(movieHasNoFiles),
		// Series whose every episode is orphaned (or that have no episodes).
		db
			.select({ n: count() })
			.from(series)
			.where(
				notExists(
					db
						.select({ id: episode.id })
						.from(episode)
						.innerJoin(mediaFile, eq(mediaFile.episodeId, episode.id))
						.where(eq(episode.seriesId, series.id))
				)
			)
	]);
	return { movies: movies.n, series: seriesRows.n };
}

export async function pruneCatalog(): Promise<PruneResult> {
	const result = await db.transaction(async (tx) => {
		const movies = await tx.delete(movie).where(movieHasNoFiles).returning({ id: movie.id });
		const episodes = await tx
			.delete(episode)
			.where(episodeHasNoFiles)
			.returning({ id: episode.id });
		await tx.delete(season).where(seasonHasNoEpisodes);
		const seriesRows = await tx
			.delete(series)
			.where(seriesHasNoEpisodes)
			.returning({ id: series.id });
		return { movies: movies.length, series: seriesRows.length, episodes: episodes.length };
	});
	if (result.movies || result.series || result.episodes) {
		log.info(result, 'pruned catalog titles without media files');
	}
	return result;
}
