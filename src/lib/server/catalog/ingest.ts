import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { ProbedFile } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { episode, library, mediaFile, movie, season, series } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import { parseEpisodePath, parseMoviePath, slugify, themeFromSlug } from './parse';

/**
 * Turns agent scan reports into catalog rows. Metadata is filename-derived
 * (NullMetadataProvider era) — a future TMDB provider fills the same columns.
 * Existing catalog entries are never overwritten by rescans; files just link
 * to them.
 */

/** In-memory scan bookkeeping: libraryId → scan start time. Single-process hub. */
const activeScans = new Map<string, Date>();

export function markScanStarted(libraryId: string): Date {
	const startedAt = new Date();
	activeScans.set(libraryId, startedAt);
	return startedAt;
}

async function resolveMovieId(file: ProbedFile): Promise<string> {
	const parsed = parseMoviePath(file.relPath);
	const slug = slugify(parsed.year ? `${parsed.title}-${parsed.year}` : parsed.title);
	const existing = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	if (existing) return existing.id;
	const [row] = await db
		.insert(movie)
		.values({
			slug,
			title: parsed.title,
			year: parsed.year ?? new Date(file.mtimeMs).getFullYear(),
			runtimeMinutes: file.durationMs ? Math.round(file.durationMs / 60_000) : 0,
			...themeFromSlug(slug)
		})
		.onConflictDoNothing({ target: movie.slug })
		.returning({ id: movie.id });
	if (row) return row.id;
	// Lost a concurrent-insert race; the row exists now.
	const raced = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	if (!raced) throw new Error(`movie upsert failed for slug ${slug}`);
	return raced.id;
}

async function resolveEpisodeId(file: ProbedFile): Promise<string | null> {
	const parsed = parseEpisodePath(file.relPath);
	if (!parsed) return null;
	const seriesSlug = slugify(parsed.showTitle);
	const year = parsed.year ?? new Date(file.mtimeMs).getFullYear();

	let seriesRow = await db.query.series.findFirst({ where: eq(series.slug, seriesSlug) });
	if (!seriesRow) {
		await db
			.insert(series)
			.values({ slug: seriesSlug, title: parsed.showTitle, year, ...themeFromSlug(seriesSlug) })
			.onConflictDoNothing({ target: series.slug });
		seriesRow = await db.query.series.findFirst({ where: eq(series.slug, seriesSlug) });
		if (!seriesRow) throw new Error(`series upsert failed for slug ${seriesSlug}`);
	}

	let seasonRow = await db.query.season.findFirst({
		where: and(eq(season.seriesId, seriesRow.id), eq(season.number, parsed.season))
	});
	if (!seasonRow) {
		await db
			.insert(season)
			.values({ seriesId: seriesRow.id, number: parsed.season, year })
			.onConflictDoNothing();
		seasonRow = await db.query.season.findFirst({
			where: and(eq(season.seriesId, seriesRow.id), eq(season.number, parsed.season))
		});
		if (!seasonRow) throw new Error(`season upsert failed for ${seriesSlug} S${parsed.season}`);
	}

	const episodeSlug = `${seriesSlug}-s${parsed.season}e${parsed.episode}`;
	const existing = await db.query.episode.findFirst({
		where: and(eq(episode.seriesId, seriesRow.id), eq(episode.slug, episodeSlug))
	});
	if (existing) return existing.id;
	const [row] = await db
		.insert(episode)
		.values({
			seasonId: seasonRow.id,
			seriesId: seriesRow.id,
			slug: episodeSlug,
			number: parsed.episode,
			title: parsed.episodeTitle ?? `Episode ${parsed.episode}`,
			runtimeMinutes: file.durationMs ? Math.round(file.durationMs / 60_000) : 0
		})
		.onConflictDoNothing()
		.returning({ id: episode.id });
	if (row) return row.id;
	const raced = await db.query.episode.findFirst({
		where: and(eq(episode.seriesId, seriesRow.id), eq(episode.slug, episodeSlug))
	});
	return raced?.id ?? null;
}

export async function ingestScanBatch(libraryId: string, files: ProbedFile[]): Promise<void> {
	const lib = await db.query.library.findFirst({ where: eq(library.id, libraryId) });
	if (!lib) {
		log.warn({ libraryId }, 'scan batch for unknown library; ignoring');
		return;
	}
	const now = new Date();
	for (const rawFile of files) {
		// Belt-and-braces: bigint columns reject fractional values.
		const file = { ...rawFile, mtimeMs: Math.round(rawFile.mtimeMs) };
		try {
			let movieId: string | null = null;
			let episodeId: string | null = null;
			if (lib.kind === 'movie') movieId = await resolveMovieId(file);
			else episodeId = await resolveEpisodeId(file);

			await db
				.insert(mediaFile)
				.values({
					libraryId,
					agentId: lib.agentId,
					relPath: file.relPath,
					size: file.size,
					mtimeMs: file.mtimeMs,
					container: file.container,
					videoCodec: file.videoCodec,
					audioCodec: file.audioCodec,
					width: file.width,
					height: file.height,
					durationMs: file.durationMs,
					bitrate: file.bitrate,
					status: 'active',
					scanSeenAt: now,
					movieId,
					episodeId
				})
				.onConflictDoUpdate({
					target: [mediaFile.libraryId, mediaFile.relPath],
					set: {
						size: file.size,
						mtimeMs: file.mtimeMs,
						container: file.container,
						videoCodec: file.videoCodec,
						audioCodec: file.audioCodec,
						width: file.width,
						height: file.height,
						durationMs: file.durationMs,
						bitrate: file.bitrate,
						status: 'active',
						scanSeenAt: now,
						movieId,
						episodeId,
						updatedAt: now
					}
				});
		} catch (err) {
			log.error({ err, relPath: file.relPath, libraryId }, 'failed to ingest scanned file');
		}
	}
}

export async function finalizeScan(
	libraryId: string,
	stats: { files: number; errors: number }
): Promise<void> {
	const startedAt = activeScans.get(libraryId);
	activeScans.delete(libraryId);
	const now = new Date();
	if (startedAt) {
		await db
			.update(mediaFile)
			.set({ status: 'missing', updatedAt: now })
			.where(
				and(
					eq(mediaFile.libraryId, libraryId),
					or(isNull(mediaFile.scanSeenAt), lt(mediaFile.scanSeenAt, startedAt))
				)
			);
	}
	await db.update(library).set({ lastScanAt: now }).where(eq(library.id, libraryId));
	log.info({ libraryId, ...stats }, 'library scan finished');
}
