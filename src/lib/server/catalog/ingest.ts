import { and, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { AudioSource, ProbedChapter, ProbedFile, SubtitleSource } from '@finderella/protocol';
import { db } from '$lib/server/db';
import {
	episode,
	library,
	mediaAudio,
	mediaFile,
	mediaMarker,
	mediaSubtitle,
	movie,
	season,
	series
} from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import { recordDeviceEvent } from '$lib/server/gateways/events';
import { hasActiveScans, type ScanReason } from '$lib/server/gateways/scan';
import { isSampleFile, parseEpisodePath, parseMoviePath, slugify, themeFromSlug } from './parse';
import { pruneCatalog } from './prune';
import { enrichPending, isTmdbConfigured } from '$lib/server/metadata';
import { queueAutoSubtitleDownload } from '$lib/server/subtitles/bulk';
import { invalidateSearchIndex } from '$lib/server/search';
import { chapterMarkers } from '$lib/server/markers/chapters';
import { queueMarkerAnalysis } from '$lib/server/markers/job';
import { queueTrickplayGeneration } from '$lib/server/trickplay/bulk';
import { scanHash } from './scan-hash';

/**
 * Turns gateway scan reports into catalog rows. Metadata is filename-derived
 * here; the TMDB provider (src/lib/server/metadata) fills the same columns
 * afterwards. Existing catalog entries are never overwritten by rescans; files
 * just link to them. Titles left without any file are pruned after a scan.
 */

/**
 * Per-library work chain so scan batches and the final prune run in the order
 * the gateway sent them: a title inserted by one batch must not look orphaned
 * to a prune that overtook its media_file insert.
 */
const scanQueues = new Map<string, Promise<void>>();

export function enqueueScanWork(libraryId: string, work: () => Promise<void>): Promise<void> {
	const prev = scanQueues.get(libraryId) ?? Promise.resolve();
	const next = prev.then(work);
	const tail = next.catch(() => {});
	scanQueues.set(libraryId, tail);
	void tail.then(() => {
		if (scanQueues.get(libraryId) === tail) scanQueues.delete(libraryId);
	});
	return next;
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

/**
 * Ingest one `scan.file` batch. Returns how many files were (re-)ingested:
 * a file whose report hashes like the last scan's only gets `scan_seen_at`.
 */
export async function ingestScanBatch(
	libraryId: string,
	gatewayId: string,
	files: ProbedFile[]
): Promise<number> {
	const lib = await db.query.library.findFirst({ where: eq(library.id, libraryId) });
	if (!lib || lib.gatewayId !== gatewayId) {
		log.warn({ libraryId, gatewayId }, 'scan batch for unknown library; ignoring');
		return 0;
	}
	const now = new Date();
	const known = new Map(
		(
			await db
				.select({
					id: mediaFile.id,
					relPath: mediaFile.relPath,
					scanHash: mediaFile.scanHash,
					status: mediaFile.status,
					movieId: mediaFile.movieId,
					episodeId: mediaFile.episodeId
				})
				.from(mediaFile)
				.where(
					and(
						eq(mediaFile.libraryId, libraryId),
						inArray(
							mediaFile.relPath,
							files.map((f) => f.relPath)
						)
					)
				)
		).map((row) => [row.relPath, row])
	);
	const unchanged: string[] = [];
	let changed = 0;
	for (const rawFile of files) {
		// Belt-and-braces: bigint columns reject fractional values.
		const file = { ...rawFile, mtimeMs: Math.round(rawFile.mtimeMs) };
		// Release-folder sample clips would otherwise become a "sample" movie or
		// a second copy of an episode. Any earlier row goes `missing` at finalize.
		if (isSampleFile(file.relPath, file.durationMs)) {
			log.debug({ relPath: file.relPath, libraryId }, 'skipping sample clip');
			continue;
		}
		const hash = scanHash(file);
		const row = known.get(file.relPath);
		// Same report as last time, still active and linked to its title: nothing to redo.
		if (row?.scanHash === hash && row.status === 'active' && (row.movieId || row.episodeId)) {
			unchanged.push(row.id);
			continue;
		}
		changed++;
		try {
			let movieId: string | null = null;
			let episodeId: string | null = null;
			if (lib.kind === 'movie') movieId = await resolveMovieId(file);
			else episodeId = await resolveEpisodeId(file);

			const [row] = await db
				.insert(mediaFile)
				.values({
					libraryId,
					gatewayId: lib.gatewayId,
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
					...(file.chapters ? { chapters: file.chapters } : {}),
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
						// A changed size/mtime is a different encode: forget its hash.
						moviehash: sql`case when ${mediaFile.size} = excluded.size and ${mediaFile.mtimeMs} = excluded.mtime_ms then ${mediaFile.moviehash} else null end`,
						moviehashAt: sql`case when ${mediaFile.size} = excluded.size and ${mediaFile.mtimeMs} = excluded.mtime_ms then ${mediaFile.moviehashAt} else null end`,
						// …and its intro/credits analysis.
						markersVersion: sql`case when ${mediaFile.size} = excluded.size and ${mediaFile.mtimeMs} = excluded.mtime_ms then ${mediaFile.markersVersion} else null end`,
						markersAnalyzedAt: sql`case when ${mediaFile.size} = excluded.size and ${mediaFile.mtimeMs} = excluded.mtime_ms then ${mediaFile.markersAnalyzedAt} else null end`,
						// …and whether the device has its trickplay sheets.
						trickplayAt: sql`case when ${mediaFile.size} = excluded.size and ${mediaFile.mtimeMs} = excluded.mtime_ms then ${mediaFile.trickplayAt} else null end`,
						// Written last (below), so a failed ingest retries next scan.
						scanHash: null,
						...(file.chapters ? { chapters: file.chapters } : {}),
						updatedAt: now
					}
				})
				.returning({ id: mediaFile.id, markersVersion: mediaFile.markersVersion });
			// Not analysed (new file, or a new encode at the same path): drop stale analysis markers.
			if (row.markersVersion === null) {
				await db
					.delete(mediaMarker)
					.where(and(eq(mediaMarker.mediaFileId, row.id), ne(mediaMarker.source, 'chapter')));
			}
			// Gateways that predate chapter discovery omit the field; keep their markers.
			if (file.chapters) await replaceChapterMarkers(row.id, file.chapters, file.durationMs);
			// Gateways that predate subtitle discovery omit the field; keep their rows.
			if (file.subtitles) await replaceSubtitles(row.id, file.subtitles);
			// Same for audio-track discovery.
			if (file.audioTracks) await replaceAudioTracks(row.id, file.audioTracks);
			await db.update(mediaFile).set({ scanHash: hash }).where(eq(mediaFile.id, row.id));
		} catch (err) {
			log.error({ err, relPath: file.relPath, libraryId }, 'failed to ingest scanned file');
		}
	}
	if (unchanged.length > 0) {
		await db.update(mediaFile).set({ scanSeenAt: now }).where(inArray(mediaFile.id, unchanged));
	}
	return changed;
}

/** The scan is the source of truth for a file's tracks: swap the whole set. */
async function replaceSubtitles(mediaFileId: string, subtitles: SubtitleSource[]): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(mediaSubtitle).where(eq(mediaSubtitle.mediaFileId, mediaFileId));
		if (subtitles.length === 0) return;
		await tx.insert(mediaSubtitle).values(
			subtitles.map((track) =>
				track.source === 'embedded'
					? {
							mediaFileId,
							source: 'embedded' as const,
							streamIndex: track.streamIndex,
							format: track.codec,
							language: track.language ?? null,
							title: track.title ?? null,
							isDefault: track.isDefault,
							forced: track.forced,
							hearingImpaired: track.hearingImpaired
						}
					: {
							mediaFileId,
							source: 'sidecar' as const,
							relPath: track.relPath,
							format: track.format,
							language: track.language ?? null,
							title: track.title ?? null,
							forced: track.forced,
							hearingImpaired: track.hearingImpaired
						}
			)
		);
	});
}

/** Intro/credits named by the container's chapters: swapped on every scan that reports them. */
async function replaceChapterMarkers(
	mediaFileId: string,
	chapters: ProbedChapter[],
	durationMs: number | undefined
): Promise<void> {
	const markers = chapterMarkers(chapters, durationMs);
	await db.transaction(async (tx) => {
		await tx
			.delete(mediaMarker)
			.where(and(eq(mediaMarker.mediaFileId, mediaFileId), eq(mediaMarker.source, 'chapter')));
		if (markers.length === 0) return;
		await tx.insert(mediaMarker).values(markers.map((m) => ({ mediaFileId, ...m })));
	});
}

/** Same wholesale swap for the file's audio streams. */
async function replaceAudioTracks(mediaFileId: string, tracks: AudioSource[]): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(mediaAudio).where(eq(mediaAudio.mediaFileId, mediaFileId));
		if (tracks.length === 0) return;
		await tx.insert(mediaAudio).values(
			tracks.map((track) => ({
				mediaFileId,
				streamIndex: track.streamIndex,
				codec: track.codec,
				language: track.language ?? null,
				title: track.title ?? null,
				channels: track.channels ?? null,
				isDefault: track.isDefault,
				commentary: track.commentary,
				descriptive: track.descriptive
			}))
		);
	});
}

export interface FinishedScan {
	startedAt: Date;
	/** Files re-ingested by this scan's batches. */
	changed: number;
	reason: ScanReason;
	actorUserId: string | null;
}

/**
 * `scan.done`: mark what the scan didn't see as missing, then (only when
 * something changed) prune, refresh search and start the background jobs.
 * `scan` is undefined for a scan this process didn't start (hub restarted
 * mid-scan): nothing is marked missing and the follow-up work always runs.
 */
export async function finalizeScan(
	libraryId: string,
	stats: { files: number; errors: number },
	scan: FinishedScan | undefined,
	incomplete: boolean
): Promise<void> {
	const now = new Date();
	let missing = 0;
	// An unreadable folder (unmounted disk, permissions) hides files that still exist.
	if (scan && !incomplete) {
		const rows = await db
			.update(mediaFile)
			.set({ status: 'missing', updatedAt: now })
			.where(
				and(
					eq(mediaFile.libraryId, libraryId),
					eq(mediaFile.status, 'active'),
					or(isNull(mediaFile.scanSeenAt), lt(mediaFile.scanSeenAt, scan.startedAt))
				)
			)
			.returning({ id: mediaFile.id });
		missing = rows.length;
	}
	await db.update(library).set({ lastScanAt: now }).where(eq(library.id, libraryId));
	const changed = scan ? scan.changed : null;
	log.info({ libraryId, ...stats, changed, missing, incomplete }, 'library scan finished');
	const quiet = changed === 0 && missing === 0;
	// Automatic scans that found nothing new stay out of the activity log.
	if (!quiet || scan?.actorUserId || scan?.reason === 'library-added') {
		await recordDeviceEvent({
			type: 'scan.finished',
			libraryId,
			detail: {
				files: stats.files,
				errors: stats.errors,
				...(changed !== null ? { changed } : {}),
				missing,
				...(incomplete ? { incomplete } : {}),
				...(scan
					? { reason: scan.reason, durationMs: now.getTime() - scan.startedAt.getTime() }
					: {})
			}
		});
	}
	if (quiet) return;
	// Another library's scan may still be inserting titles; it prunes at its own end.
	if (!hasActiveScans()) {
		await pruneCatalog().catch((err) => log.error({ err }, 'catalog prune failed'));
	}
	// New or renamed titles: the search index rebuilds on the next query.
	invalidateSearchIndex();
	// New titles get TMDB metadata in the background; single-flight, so a
	// second scan finishing mid-pass just queues one more pass.
	if (await isTmdbConfigured()) {
		void enrichPending().catch((err) => log.error({ err }, 'metadata enrichment failed'));
	} else {
		// No metadata pass to wait for: search by title right away.
		void queueAutoSubtitleDownload().catch((err) =>
			log.error({ err }, 'auto subtitle download failed')
		);
	}
	// New episodes/movies get intro/credits detection and trickplay sheets (background, single-flight).
	queueMarkerAnalysis();
	queueTrickplayGeneration();
}
