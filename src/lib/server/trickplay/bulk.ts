import { and, asc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { posix } from 'node:path';
import { db } from '$lib/server/db';
import { library, mediaFile } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import { queueDeviceEvent } from '$lib/server/gateways/events';
import { trickplayEnabled } from '$lib/server/site-settings';
import { ensureTrickplay } from './ensure';

/**
 * Admin-started "Generate thumbnails" job for one library. Single-flight with
 * live progress and a stop switch, like the subtitle bulk job. The hub drives
 * it file by file: `trickplay.ensure` at low priority, then poll until the
 * device reports the sheets ready. Stopping only stops queueing more files —
 * whatever ffmpeg is rendering on the device runs to completion (the cache
 * still fills for the next play).
 */

export interface TrickplayBulkStatus {
	running: boolean;
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
	if (status.running) status.stopRequested = true;
}

export type StartOutcome =
	'started' | 'busy' | 'disabled' | 'offline' | 'unsupported' | 'not-found';

/** Admin-started run for one library. Rejects when a run is active or the device can't do it. */
export async function startTrickplayBulk(libraryId: string): Promise<StartOutcome> {
	if (status.running) return 'busy';
	if (!(await trickplayEnabled())) return 'disabled';
	const lib = await db.query.library.findFirst({ where: eq(library.id, libraryId) });
	if (!lib) return 'not-found';
	const gateway = registry.get(lib.gatewayId);
	if (!gateway) return 'offline';
	if (!gateway.capabilities.trickplay) return 'unsupported';
	// Claim the slot synchronously so two admins clicking at once can't both start.
	status.running = true;
	void runJob(lib).catch((err) => {
		status.running = false;
		status.finishedAt = new Date().toISOString();
		status.lastError = (err as Error).message;
		log.error({ err, libraryId }, 'trickplay bulk job crashed');
	});
	return 'started';
}

type LibraryRow = typeof library.$inferSelect;

async function runJob(lib: LibraryRow): Promise<void> {
	Object.assign(status, {
		running: true,
		libraryId: lib.id,
		libraryName: lib.name,
		startedAt: new Date().toISOString(),
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
	});
	try {
		const linked = or(isNotNull(mediaFile.movieId), isNotNull(mediaFile.episodeId));
		const [files, unprobed] = await Promise.all([
			db.query.mediaFile.findMany({
				where: and(
					eq(mediaFile.libraryId, lib.id),
					eq(mediaFile.status, 'active'),
					isNotNull(mediaFile.durationMs),
					linked
				),
				orderBy: [asc(mediaFile.relPath)]
			}),
			db.query.mediaFile.findMany({
				columns: { id: true },
				where: and(
					eq(mediaFile.libraryId, lib.id),
					eq(mediaFile.status, 'active'),
					isNull(mediaFile.durationMs),
					linked
				)
			})
		]);
		status.total = files.length;
		status.skipped = unprobed.length;
		note(
			'info',
			`Generating thumbnails for "${lib.name}": ${files.length} files` +
				(unprobed.length ? ` (${unprobed.length} skipped — no probed duration)` : '') +
				'.'
		);

		for (const file of files) {
			if (status.stopRequested) {
				note(
					'warn',
					'Stopped by an administrator. A file still rendering on the device finishes on its own.'
				);
				break;
			}
			const gateway = registry.get(lib.gatewayId);
			if (!gateway?.capabilities.trickplay) {
				note('error', 'Device went offline; stopping.');
				break;
			}
			const label = posix.basename(file.relPath);
			status.current = label;
			const target = { gatewayId: lib.gatewayId, rootPath: lib.rootPath, file };
			try {
				await processFile(target, label);
			} catch (err) {
				status.failed++;
				status.lastError = (err as Error).message;
				note('error', `${label}: ${(err as Error).message}`);
			}
			status.processed++;
		}
		note(
			'info',
			`Finished: ${status.generated} generated, ${status.alreadyReady} already had thumbnails, ${status.failed} failed.`
		);
	} finally {
		status.running = false;
		status.current = null;
		status.finishedAt = new Date().toISOString();
		queueDeviceEvent({
			type: 'thumbnails.finished',
			libraryId: lib.id,
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
}

async function processFile(
	target: Parameters<typeof ensureTrickplay>[0],
	label: string
): Promise<void> {
	const first = await ensureTrickplay(target, 'low', ENSURE_TIMEOUT_MS);
	if (!first) throw new Error('device did not answer');
	if (first.status === 'ready') {
		status.alreadyReady++;
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
			note('info', `${label}: ${result.geometry?.sheets ?? '?'} sheet(s) generated`);
			return;
		}
		if (result.status === 'failed') throw new Error(result.error ?? 'generation failed');
	}
}
