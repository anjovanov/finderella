import { and, asc, eq, inArray, isNotNull, isNull, lt, or, type SQL } from 'drizzle-orm';
import { posix } from 'node:path';
import { db } from '$lib/server/db';
import {
	episode,
	library,
	mediaAudio,
	mediaFile,
	mediaMarker,
	season
} from '$lib/server/db/schema';
import { queueDeviceEvent } from '$lib/server/gateways/events';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import { markersEnabled } from '$lib/server/site-settings';
import { awaitAnalysis, regionFingerprint, type AnalysisTarget } from './analyze';
import { detectDarkCredits } from './darkframes';
import { analysisSpec, pickAnalysisAudio } from './regions';
import { detectSeasonMarkers, type SeasonFile } from './season';
import type { MarkerKind } from '$lib/data/markers';
import { MARKERS_VERSION, type DetectedMarker } from './types';

/**
 * The intro/credits analysis job. Runs after every scan, when a capable
 * device connects, and when an administrator starts it for a library.
 * Single-flight: a trigger while a pass runs queues one more pass.
 *
 * Movies: the device samples dark frames near the end → rolling credits.
 * Series: every episode of a season with a pending file is fingerprinted
 * (the device caches analyses, so already-analysed episodes answer at once)
 * and compared season-wide; the whole season's markers are rewritten, since
 * a new episode adds support for its neighbours' matches too.
 */

export interface MarkersJobStatus {
	running: boolean;
	/** Library an administrator started the run for; null = automatic, every library. */
	libraryId: string | null;
	libraryName: string | null;
	startedAt: string | null;
	finishedAt: string | null;
	total: number;
	processed: number;
	intros: number;
	credits: number;
	failed: number;
	/** Pending files on devices that are offline or can't analyse (picked up later). */
	waiting: number;
	current: string | null;
	stopRequested: boolean;
	recent: { at: string; level: 'info' | 'warn' | 'error'; message: string }[];
	lastError: string | null;
}

const RECENT_LINES = 40;
/** Fewer distinct episodes than this in a season: borrow partners from the adjacent seasons. */
const MIN_SEASON_EPISODES = 3;

const status: MarkersJobStatus = {
	running: false,
	libraryId: null,
	libraryName: null,
	startedAt: null,
	finishedAt: null,
	total: 0,
	processed: 0,
	intros: 0,
	credits: 0,
	failed: 0,
	waiting: 0,
	current: null,
	stopRequested: false,
	recent: [],
	lastError: null
};

interface RunScope {
	libraryId: string | null;
	/** Re-analyse everything in scope, not just pending files. */
	force: boolean;
	actorUserId: string | null;
}

let queued: RunScope | null = null;
let scheduled: ReturnType<typeof setTimeout> | null = null;

function note(level: MarkersJobStatus['recent'][number]['level'], message: string) {
	status.recent.unshift({ at: new Date().toISOString(), level, message });
	if (status.recent.length > RECENT_LINES) status.recent.length = RECENT_LINES;
	if (level === 'error') log.warn({ message }, 'markers job');
	else log.info({ message }, 'markers job');
}

export function markersJobStatus(): MarkersJobStatus {
	return { ...status, recent: [...status.recent] };
}

export function stopMarkersJob(): void {
	if (status.running) {
		status.stopRequested = true;
		queued = null;
	}
}

/** Automatic pass over every library (after a scan). No-op while the feature is off. */
export function queueMarkerAnalysis(): void {
	void startRun({ libraryId: null, force: false, actorUserId: null }).catch((err) =>
		log.error({ err }, 'marker analysis failed')
	);
}

/** Debounced automatic pass — a device that just connected may finish its hello burst first. */
export function scheduleMarkerAnalysis(delayMs: number): void {
	if (scheduled) clearTimeout(scheduled);
	scheduled = setTimeout(() => {
		scheduled = null;
		queueMarkerAnalysis();
	}, delayMs);
	scheduled.unref?.();
}

export type StartOutcome =
	'started' | 'busy' | 'disabled' | 'offline' | 'unsupported' | 'not-found';

/** Admin "Re-detect intros & credits" for one library: re-analyses every file in it. */
export async function startMarkersForLibrary(
	libraryId: string,
	actorUserId: string | null
): Promise<StartOutcome> {
	if (status.running) return 'busy';
	if (!(await markersEnabled())) return 'disabled';
	const lib = await db.query.library.findFirst({ where: eq(library.id, libraryId) });
	if (!lib) return 'not-found';
	const gateway = registry.get(lib.gatewayId);
	if (!gateway) return 'offline';
	if (!gateway.capabilities.markers) return 'unsupported';
	void startRun({ libraryId, force: true, actorUserId }).catch((err) =>
		log.error({ err, libraryId }, 'marker analysis failed')
	);
	return 'started';
}

async function startRun(scope: RunScope): Promise<void> {
	if (status.running) {
		// One follow-up pass covers every trigger that arrives meanwhile.
		queued =
			queued && (queued.libraryId !== scope.libraryId || queued.force !== scope.force)
				? { libraryId: null, force: false, actorUserId: null }
				: scope;
		return;
	}
	if (!(await markersEnabled())) return;
	// Claim the slot synchronously (after the await) so two triggers can't both start.
	if (status.running) {
		queued = scope;
		return;
	}
	status.running = true;
	let next: RunScope | null = scope;
	try {
		while (next) {
			const current: RunScope = next;
			queued = null;
			try {
				await runPass(current);
			} catch (err) {
				status.lastError = (err as Error).message;
				log.error({ err }, 'marker analysis pass crashed');
			}
			next = queued;
		}
	} finally {
		status.running = false;
		status.current = null;
		queued = null;
	}
}

interface FileRow {
	id: string;
	relPath: string;
	size: number;
	mtimeMs: number;
	durationMs: number | null;
	markersVersion: number | null;
	gatewayId: string;
	rootPath: string;
	libraryId: string;
	movieId: string | null;
	episodeId: string | null;
	seasonId: string | null;
	seriesId: string | null;
	seasonNumber: number | null;
	episodeNumber: number | null;
}

function selectFiles(where: SQL | undefined): Promise<FileRow[]> {
	return db
		.select({
			id: mediaFile.id,
			relPath: mediaFile.relPath,
			size: mediaFile.size,
			mtimeMs: mediaFile.mtimeMs,
			durationMs: mediaFile.durationMs,
			markersVersion: mediaFile.markersVersion,
			gatewayId: mediaFile.gatewayId,
			rootPath: library.rootPath,
			libraryId: library.id,
			movieId: mediaFile.movieId,
			episodeId: mediaFile.episodeId,
			seasonId: episode.seasonId,
			seriesId: episode.seriesId,
			seasonNumber: season.number,
			episodeNumber: episode.number
		})
		.from(mediaFile)
		.innerJoin(library, eq(library.id, mediaFile.libraryId))
		.leftJoin(episode, eq(episode.id, mediaFile.episodeId))
		.leftJoin(season, eq(season.id, episode.seasonId))
		.where(
			and(
				eq(mediaFile.status, 'active'),
				isNotNull(mediaFile.durationMs),
				or(isNotNull(mediaFile.movieId), isNotNull(mediaFile.episodeId)),
				where
			)
		)
		.orderBy(asc(mediaFile.relPath));
}

function canAnalyse(gatewayId: string): boolean {
	return Boolean(registry.get(gatewayId)?.capabilities.markers);
}

function target(row: FileRow): AnalysisTarget {
	return { fileId: row.id, gatewayId: row.gatewayId, rootPath: row.rootPath, relPath: row.relPath };
}

const yieldControl = () => new Promise<void>((resolve) => setImmediate(resolve));

async function runPass(scope: RunScope): Promise<void> {
	const lib = scope.libraryId
		? await db.query.library.findFirst({ where: eq(library.id, scope.libraryId) })
		: null;
	if (scope.libraryId && !lib) return;
	if (scope.force && lib) {
		await db
			.update(mediaFile)
			.set({ markersVersion: null, markersError: null })
			.where(eq(mediaFile.libraryId, lib.id));
	}

	const pending = await selectFiles(
		and(
			or(isNull(mediaFile.markersVersion), lt(mediaFile.markersVersion, MARKERS_VERSION)),
			lib ? eq(mediaFile.libraryId, lib.id) : undefined
		)
	);
	const ready = pending.filter((row) => canAnalyse(row.gatewayId));
	// Automatic passes with nothing to do stay silent (they run after every scan).
	if (ready.length === 0 && !lib) return;

	Object.assign(status, {
		libraryId: lib?.id ?? null,
		libraryName: lib?.name ?? null,
		startedAt: new Date().toISOString(),
		finishedAt: null,
		total: ready.length,
		processed: 0,
		intros: 0,
		credits: 0,
		failed: 0,
		waiting: pending.length - ready.length,
		current: null,
		stopRequested: false,
		recent: [],
		lastError: null
	});
	note(
		'info',
		`Detecting intros & credits${lib ? ` in "${lib.name}"` : ''}: ${ready.length} file${ready.length === 1 ? '' : 's'}` +
			(status.waiting ? ` (${status.waiting} waiting for their device)` : '') +
			'.'
	);
	if (lib) {
		queueDeviceEvent({
			type: 'markers.started',
			actorUserId: scope.actorUserId,
			libraryId: lib.id
		});
	}

	try {
		for (const row of ready.filter((r) => r.movieId)) {
			if (status.stopRequested) break;
			await analyseMovie(row);
		}
		const seasons = new Map<string, FileRow[]>();
		for (const row of ready) {
			if (!row.seasonId) continue;
			const list = seasons.get(row.seasonId);
			if (list) list.push(row);
			else seasons.set(row.seasonId, [row]);
		}
		for (const rows of seasons.values()) {
			if (status.stopRequested) break;
			await analyseSeason(rows);
		}
		if (status.stopRequested) {
			note('warn', 'Stopped by an administrator. The rest stays pending for the next run.');
		}
		note(
			'info',
			`Finished: ${status.intros} intro${status.intros === 1 ? '' : 's'} and ${status.credits} credits found in ${status.processed} files` +
				(status.failed ? `, ${status.failed} failed` : '') +
				'.'
		);
	} finally {
		status.current = null;
		status.finishedAt = new Date().toISOString();
		queueDeviceEvent({
			type: 'markers.finished',
			libraryId: lib?.id ?? null,
			detail: {
				processed: status.processed,
				intros: status.intros,
				credits: status.credits,
				failed: status.failed,
				stopped: status.stopRequested,
				durationMs: Date.parse(status.finishedAt) - Date.parse(status.startedAt!)
			}
		});
	}
}

async function analyseMovie(row: FileRow): Promise<void> {
	status.current = posix.basename(row.relPath);
	try {
		const chapters = await chapterKinds(row.id);
		const spec = analysisSpec('movie', row.durationMs ?? 0);
		if (chapters.has('credits') || !spec) {
			await saveMarkers(row, []);
			await count(row, []);
			status.processed++;
			return;
		}
		const outcome = await awaitAnalysis(target(row), spec, undefined, () => status.stopRequested);
		if (outcome.status === 'unavailable') return;
		if (outcome.status === 'failed') {
			await saveMarkers(row, [], outcome.error);
			fail(row, outcome.error);
			return;
		}
		const dark = outcome.analysis.darkframes
			? detectDarkCredits(outcome.analysis.darkframes, row.durationMs!, 'movie')
			: null;
		await saveMarkers(row, dark ? [dark] : []);
		await count(row, dark ? [dark] : []);
		status.processed++;
	} catch (err) {
		fail(row, (err as Error).message);
	}
}

async function analyseSeason(pendingRows: FileRow[]): Promise<void> {
	const { seasonId, seriesId, seasonNumber } = pendingRows[0];
	if (!seasonId || !seriesId || seasonNumber === null) return;
	let rows = await selectFiles(eq(episode.seasonId, seasonId));
	const episodes = new Set(rows.map((r) => r.episodeId));
	if (episodes.size < MIN_SEASON_EPISODES) {
		const neighbours = await db.query.season.findMany({
			columns: { id: true },
			where: and(
				eq(season.seriesId, seriesId),
				inArray(season.number, [seasonNumber - 1, seasonNumber + 1])
			)
		});
		if (neighbours.length > 0) {
			rows = rows.concat(
				await selectFiles(
					inArray(
						episode.seasonId,
						neighbours.map((n) => n.id)
					)
				)
			);
		}
	}
	rows = rows.filter((r) => canAnalyse(r.gatewayId));

	const audio = await db
		.select({
			mediaFileId: mediaAudio.mediaFileId,
			streamIndex: mediaAudio.streamIndex,
			isDefault: mediaAudio.isDefault,
			commentary: mediaAudio.commentary,
			descriptive: mediaAudio.descriptive
		})
		.from(mediaAudio)
		.where(
			inArray(
				mediaAudio.mediaFileId,
				rows.map((r) => r.id)
			)
		)
		.orderBy(asc(mediaAudio.streamIndex));

	const pendingIds = new Set(pendingRows.map((r) => r.id));
	const files: SeasonFile[] = [];
	const darkframes = new Map<string, DetectedMarker | null>();
	const inSeason: FileRow[] = [];

	for (const row of rows) {
		if (status.stopRequested) return;
		const spec = analysisSpec('series', row.durationMs ?? 0);
		const own = row.seasonId === seasonId;
		if (!spec) {
			if (pendingIds.has(row.id)) {
				await saveMarkers(row, []);
				await count(row, []);
				status.processed++;
			}
			continue;
		}
		if (own) status.current = posix.basename(row.relPath);
		const outcome = await awaitAnalysis(
			target(row),
			spec,
			pickAnalysisAudio(audio.filter((a) => a.mediaFileId === row.id)),
			() => status.stopRequested
		);
		if (outcome.status === 'unavailable') continue;
		if (outcome.status === 'failed') {
			if (pendingIds.has(row.id)) {
				await saveMarkers(row, [], outcome.error).catch(() => {});
				fail(row, outcome.error);
			}
			continue;
		}
		const { analysis } = outcome;
		files.push({
			id: row.id,
			episodeId: row.episodeId!,
			seasonNumber: row.seasonNumber ?? 0,
			episodeNumber: row.episodeNumber ?? 0,
			durationMs: row.durationMs!,
			version: analysis.version,
			hopMs: analysis.hopMs,
			intro: regionFingerprint(analysis, 'intro'),
			credits: regionFingerprint(analysis, 'credits')
		});
		if (own) {
			inSeason.push(row);
			darkframes.set(
				row.id,
				analysis.darkframes
					? detectDarkCredits(analysis.darkframes, row.durationMs!, 'series')
					: null
			);
		}
	}
	if (status.stopRequested) return;

	const targets = new Set(inSeason.map((r) => r.id));
	const detected = await detectSeasonMarkers(files, targets, { yieldControl });
	for (const row of inSeason) {
		try {
			const markers = [...(detected.get(row.id) ?? [])];
			const dark = darkframes.get(row.id);
			if (dark) markers.push(dark);
			await saveMarkers(row, markers);
			if (pendingIds.has(row.id)) {
				await count(row, markers);
				status.processed++;
			}
		} catch (err) {
			fail(row, (err as Error).message);
		}
	}
}

/** Kinds a file already has from its chapters (kept across analyses). */
async function chapterKinds(fileId: string): Promise<Set<MarkerKind>> {
	const rows = await db
		.select({ kind: mediaMarker.kind })
		.from(mediaMarker)
		.where(and(eq(mediaMarker.mediaFileId, fileId), eq(mediaMarker.source, 'chapter')));
	return new Set(rows.map((r) => r.kind));
}

/** Tally what the file ends up with — analysis results plus chapter markers. */
async function count(row: FileRow, markers: DetectedMarker[]): Promise<void> {
	const kinds = await chapterKinds(row.id);
	for (const m of markers) kinds.add(m.kind);
	if (kinds.has('intro')) status.intros++;
	if (kinds.has('credits')) status.credits++;
}

function fail(row: FileRow, message: string): void {
	status.failed++;
	status.processed++;
	status.lastError = message;
	note('error', `${posix.basename(row.relPath)}: ${message}`);
}

/**
 * Replace a file's analysis markers and stamp it analysed. Skipped when the
 * file changed since it was selected (a rescan of a new encode resets it).
 */
async function saveMarkers(row: FileRow, markers: DetectedMarker[], error?: string): Promise<void> {
	await db.transaction(async (tx) => {
		const stamped = await tx
			.update(mediaFile)
			.set({
				markersVersion: MARKERS_VERSION,
				markersAnalyzedAt: new Date(),
				markersError: error ?? null
			})
			.where(
				and(
					eq(mediaFile.id, row.id),
					eq(mediaFile.size, row.size),
					eq(mediaFile.mtimeMs, row.mtimeMs)
				)
			)
			.returning({ id: mediaFile.id });
		if (stamped.length === 0) return;
		await tx
			.delete(mediaMarker)
			.where(
				and(
					eq(mediaMarker.mediaFileId, row.id),
					inArray(mediaMarker.source, ['fingerprint', 'darkframes'])
				)
			);
		const rows = markers.filter((m) => m.source !== 'chapter');
		if (rows.length > 0) {
			await tx.insert(mediaMarker).values(
				rows.map((m) => ({
					mediaFileId: row.id,
					kind: m.kind,
					source: m.source,
					startMs: Math.round(m.startMs),
					endMs: Math.round(m.endMs),
					confidence: m.confidence
				}))
			);
		}
	});
}
