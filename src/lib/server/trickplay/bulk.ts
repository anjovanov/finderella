import { and, asc, desc, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { posix } from 'node:path';
import { db } from '$lib/server/db';
import { library, mediaFile } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import { queueDeviceEvent } from '$lib/server/gateways/events';
import { trickplayAutoEnabled, trickplayEnabled } from '$lib/server/site-settings';
import { ensureTrickplay, type TrickplayTarget } from './ensure';

/**
 * The trickplay generation job, with live progress and a stop switch.
 *
 * - Automatic passes (after scans, when a capable device connects, when the
 *   setting is switched on) cover every library but only files without
 *   `trickplay_at`, newest first, so a new episode gets its sheets before the
 *   backfill of older files. Each device works through its own files in
 *   parallel with the others.
 * - An administrator's "Regenerate trickplay thumbnails" covers every file of one
 *   library (re-checking those already stamped) and goes ahead of an
 *   automatic pass, which is cut short and resumes afterwards.
 *
 * The hub drives it file by file: `trickplay.ensure` at low priority, then
 * poll until the device reports the sheets ready (→ `trickplay_at`). Stopping
 * only stops queueing more files — whatever ffmpeg is rendering on the device
 * runs to completion (the cache still fills for the next play).
 */

export interface TrickplayBulkStatus {
	running: boolean;
	/** Library an administrator started the run for; null = automatic, every library. */
	libraryId: string | null;
	libraryName: string | null;
	startedAt: string | null;
	finishedAt: string | null;
	total: number;
	processed: number;
	generated: number;
	alreadyReady: number;
	failed: number;
	/** Active files scanned without a duration (no ffprobe) — nothing to lay out. */
	skipped: number;
	current: string | null;
	stopRequested: boolean;
	recent: { at: string; level: 'info' | 'warn' | 'error'; message: string }[];
	lastError: string | null;
}

const ENSURE_TIMEOUT_MS = 15_000;
const POLL_MS = 3_000;
/** A single file may not hold the run hostage (a huge 4K remux on a slow NAS). */
const FILE_CAP_MS = 30 * 60 * 1000;
const RECENT_LINES = 40;

const status: TrickplayBulkStatus = {
	running: false,
	libraryId: null,
	libraryName: null,
	startedAt: null,
	finishedAt: null,
	total: 0,
	processed: 0,
	generated: 0,
	alreadyReady: 0,
	failed: 0,
	skipped: 0,
	current: null,
	stopRequested: false,
	recent: [],
	lastError: null
};

/** Work waiting for the running pass: administrator runs (in order) and one automatic pass. */
const queued = { libraries: new Map<string, string | null>(), auto: false };
let scheduled: ReturnType<typeof setTimeout> | null = null;

/**
 * Files that failed in this process (id → size:mtime): automatic passes skip
 * them instead of re-running ffmpeg after every scan. A new encode retries.
 */
const failedFiles = new Map<string, string>();

function note(level: TrickplayBulkStatus['recent'][number]['level'], message: string) {
	status.recent.unshift({ at: new Date().toISOString(), level, message });
	if (status.recent.length > RECENT_LINES) status.recent.length = RECENT_LINES;
	if (level === 'error') log.warn({ message }, 'trickplay bulk');
	else log.info({ message }, 'trickplay bulk');
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function trickplayBulkStatus(): TrickplayBulkStatus {
	return { ...status, recent: [...status.recent] };
}

export function stopTrickplayBulk(): void {
	if (!status.running) return;
	status.stopRequested = true;
	queued.libraries.clear();
	queued.auto = false;
}

export type StartOutcome =
	'started' | 'queued' | 'disabled' | 'offline' | 'unsupported' | 'not-found';

/** Admin-started run for one library; queued (ahead of automatic work) while another run is active. */
export async function startTrickplayBulk(
	libraryId: string,
	actorUserId: string | null = null
): Promise<StartOutcome> {
	if (!(await trickplayEnabled())) return 'disabled';
	const lib = await db.query.library.findFirst({ where: eq(library.id, libraryId) });
	if (!lib) return 'not-found';
	const gateway = registry.get(lib.gatewayId);
	if (!gateway) return 'offline';
	if (!gateway.capabilities.trickplay) return 'unsupported';
	queued.libraries.set(libraryId, actorUserId);
	if (status.running) return 'queued';
	run();
	return 'started';
}

/** Automatic pass over every library's pending files. No-op unless trickplay + auto are on. */
export function queueTrickplayGeneration(): void {
	void (async () => {
		if (!(await trickplayAutoEnabled())) return;
		queued.auto = true;
		if (!status.running) run();
	})().catch((err) => log.error({ err }, 'trickplay generation failed'));
}

/** Debounced automatic pass — a device that just connected may finish its hello burst first. */
export function scheduleTrickplayGeneration(delayMs: number): void {
	if (scheduled) clearTimeout(scheduled);
	scheduled = setTimeout(() => {
		scheduled = null;
		queueTrickplayGeneration();
	}, delayMs);
	scheduled.unref?.();
}

/** Claims the slot synchronously, then drains the queue: administrator runs first. */
function run(): void {
	status.running = true;
	void (async () => {
		try {
			for (;;) {
				const [next] = queued.libraries;
				if (next) {
					queued.libraries.delete(next[0]);
					await runLibraryPass(next[0], next[1]);
				} else if (queued.auto) {
					queued.auto = false;
					await runAutoPass();
				} else break;
			}
		} catch (err) {
			status.lastError = (err as Error).message;
			log.error({ err }, 'trickplay bulk job crashed');
		} finally {
			status.running = false;
			status.current = null;
		}
	})();
}

interface FileRow {
	id: string;
	relPath: string;
	size: number;
	mtimeMs: number;
	durationMs: number | null;
	gatewayId: string;
	rootPath: string;
}

const linked = or(isNotNull(mediaFile.movieId), isNotNull(mediaFile.episodeId));

function selectFiles(where: SQL | undefined, order: SQL): Promise<FileRow[]> {
	return db
		.select({
			id: mediaFile.id,
			relPath: mediaFile.relPath,
			size: mediaFile.size,
			mtimeMs: mediaFile.mtimeMs,
			durationMs: mediaFile.durationMs,
			gatewayId: mediaFile.gatewayId,
			rootPath: library.rootPath
		})
		.from(mediaFile)
		.innerJoin(library, eq(library.id, mediaFile.libraryId))
		.where(and(eq(mediaFile.status, 'active'), linked, where))
		.orderBy(order);
}

function canGenerate(gatewayId: string): boolean {
	return Boolean(registry.get(gatewayId)?.capabilities.trickplay);
}

function resetStatus(lib: { id: string; name: string } | null, total: number, skipped: number) {
	Object.assign(status, {
		libraryId: lib?.id ?? null,
		libraryName: lib?.name ?? null,
		startedAt: new Date().toISOString(),
		finishedAt: null,
		total,
		processed: 0,
		generated: 0,
		alreadyReady: 0,
		failed: 0,
		skipped,
		current: null,
		stopRequested: false,
		recent: [],
		lastError: null
	});
}

async function runLibraryPass(libraryId: string, actorUserId: string | null): Promise<void> {
	const lib = await db.query.library.findFirst({ where: eq(library.id, libraryId) });
	if (!lib) return;
	const files = await selectFiles(eq(mediaFile.libraryId, lib.id), asc(mediaFile.relPath));
	const withDuration = files.filter((f) => f.durationMs !== null);
	const skipped = files.length - withDuration.length;
	resetStatus(lib, withDuration.length, skipped);
	note(
		'info',
		`Generating thumbnails for "${lib.name}": ${withDuration.length} files` +
			(skipped ? ` (${skipped} skipped — no probed duration)` : '') +
			'.'
	);
	queueDeviceEvent({ type: 'thumbnails.started', actorUserId, libraryId: lib.id });
	await processAll(withDuration, { preemptible: false });
	finish(lib.id);
}

async function runAutoPass(): Promise<void> {
	if (!(await trickplayAutoEnabled())) return;
	const pending = await selectFiles(
		and(isNull(mediaFile.trickplayAt), isNotNull(mediaFile.durationMs)),
		desc(mediaFile.createdAt)
	);
	const ready = pending.filter(
		(row) => canGenerate(row.gatewayId) && failedFiles.get(row.id) !== `${row.size}:${row.mtimeMs}`
	);
	// Automatic passes with nothing to do stay silent (they run after every scan).
	if (ready.length === 0) return;
	resetStatus(null, ready.length, 0);
	note(
		'info',
		`Generating thumbnails for ${ready.length} new file${ready.length === 1 ? '' : 's'}.`
	);
	const cut = await processAll(ready, { preemptible: true });
	if (cut) {
		note('info', 'Paused for an administrator’s run; the rest continues afterwards.');
		queued.auto = true;
	}
	finish(null);
}

function finish(libraryId: string | null) {
	status.current = null;
	status.finishedAt = new Date().toISOString();
	if (status.stopRequested) {
		note(
			'warn',
			'Stopped by an administrator. A file still rendering on the device finishes on its own.'
		);
	}
	note(
		'info',
		`Finished: ${status.generated} generated, ${status.alreadyReady} already had thumbnails, ${status.failed} failed.`
	);
	queueDeviceEvent({
		type: 'thumbnails.finished',
		libraryId,
		detail: {
			total: status.total,
			processed: status.processed,
			generated: status.generated,
			alreadyReady: status.alreadyReady,
			failed: status.failed,
			skipped: status.skipped,
			stopped: status.stopRequested,
			durationMs: Date.parse(status.finishedAt) - Date.parse(status.startedAt!)
		}
	});
}

/**
 * One sequential worker per device, devices in parallel. Returns true when
 * an automatic pass was cut short for a queued administrator run.
 */
async function processAll(files: FileRow[], opts: { preemptible: boolean }): Promise<boolean> {
	const byGateway = new Map<string, FileRow[]>();
	for (const file of files) {
		const list = byGateway.get(file.gatewayId);
		if (list) list.push(file);
		else byGateway.set(file.gatewayId, [file]);
	}
	let cut = false;
	const halted = () => {
		if (opts.preemptible && queued.libraries.size > 0) cut = true;
		return status.stopRequested || cut;
	};
	await Promise.all(
		[...byGateway].map(async ([gatewayId, rows]) => {
			for (const file of rows) {
				if (halted()) return;
				if (!canGenerate(gatewayId)) {
					note('error', 'Device went offline; skipping the rest of its files.');
					return;
				}
				const label = posix.basename(file.relPath);
				status.current = label;
				try {
					await processFile({ gatewayId, rootPath: file.rootPath, file }, file, label);
				} catch (err) {
					status.failed++;
					status.lastError = (err as Error).message;
					failedFiles.set(file.id, `${file.size}:${file.mtimeMs}`);
					note('error', `${label}: ${(err as Error).message}`);
				}
				status.processed++;
			}
		})
	);
	return cut && !status.stopRequested;
}

/** The device has this encode's sheets (only if the file wasn't replaced meanwhile). */
export async function markTrickplayReady(
	file: Pick<FileRow, 'id' | 'size' | 'mtimeMs'>
): Promise<void> {
	failedFiles.delete(file.id);
	await db
		.update(mediaFile)
		.set({ trickplayAt: new Date() })
		.where(
			and(
				eq(mediaFile.id, file.id),
				eq(mediaFile.size, file.size),
				eq(mediaFile.mtimeMs, file.mtimeMs)
			)
		);
}

async function processFile(target: TrickplayTarget, file: FileRow, label: string): Promise<void> {
	const first = await ensureTrickplay(target, 'low', ENSURE_TIMEOUT_MS);
	if (!first) throw new Error('device did not answer');
	if (first.status === 'ready') {
		status.alreadyReady++;
		await markTrickplayReady(file);
		return;
	}
	if (first.status === 'failed') throw new Error(first.error ?? 'generation failed');

	const deadline = Date.now() + FILE_CAP_MS;
	for (;;) {
		await sleep(POLL_MS);
		if (status.stopRequested) return; // counted as processed, not generated
		if (Date.now() > deadline) throw new Error('timed out waiting for the device');
		const result = await ensureTrickplay(target, 'low', ENSURE_TIMEOUT_MS);
		if (!result) throw new Error('device did not answer');
		if (result.status === 'ready') {
			status.generated++;
			await markTrickplayReady(file);
			note('info', `${label}: ${result.geometry?.sheets ?? '?'} sheet(s) generated`);
			return;
		}
		if (result.status === 'failed') throw new Error(result.error ?? 'generation failed');
	}
}
