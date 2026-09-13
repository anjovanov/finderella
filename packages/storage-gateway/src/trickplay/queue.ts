import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { constants as osConstants, setPriority } from 'node:os';
import type { TrickplayEnsureResult, TrickplayGeometry } from '@finderella/protocol';
import { probeTrickplaySource } from '../probe.js';
import {
	clearEntry,
	countSheets,
	ensureEntryDir,
	entryDir,
	entryExists,
	readManifest,
	sheetComplete,
	sheetPath,
	writeManifest
} from './cache.js';
import { trickplayArgs } from './ffmpeg.js';
import { computeGeometry, trickplayCacheKey } from './geometry.js';

export type TrickplayPriority = 'high' | 'low';

interface Job {
	key: string;
	absPath: string;
	dir: string;
	size: number;
	mtimeMs: number;
	geometry: TrickplayGeometry;
	hdr: boolean;
	priority: TrickplayPriority;
	state: 'queued' | 'running';
}

interface QueueOptions {
	ffmpegBin: () => string | null;
	log: (message: string) => void;
}

const STDERR_TAIL_CHARS = 2000;
const SHEET_POLL_MS = 250;
/** Remembered failures (in memory only): a broken file isn't re-probed on every hover. */
const MAX_REMEMBERED_FAILURES = 200;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(done, ms);
		function done() {
			clearTimeout(timer);
			signal?.removeEventListener('abort', done);
			resolve();
		}
		signal?.addEventListener('abort', done, { once: true });
	});
}

/**
 * Sprite-sheet jobs for the device. Two lanes — at most one `low` (admin
 * bulk) and one `high` (a viewer pressed play) ffmpeg at a time — so a first
 * play never queues behind a library-wide run; both run at the lowest OS
 * priority so a transcode on the same box keeps its CPU. Jobs are keyed by
 * file identity (single-flight) and never killed because a viewer left: the
 * cache still fills for the next one.
 */
export class TrickplayQueue {
	#opts: QueueOptions;
	#jobs = new Map<string, Job>();
	#queue: Job[] = [];
	#running = { high: 0, low: 0 };
	#failed = new Map<string, string>();
	/** Per-key single-flight for the probe + enqueue step. */
	#ensuring = new Map<string, Promise<TrickplayEnsureResult>>();

	constructor(opts: QueueOptions) {
		this.#opts = opts;
	}

	/** Report the file's sheets: start a job when there is none, promote a queued one. */
	async ensure(absPath: string, priority: TrickplayPriority): Promise<TrickplayEnsureResult> {
		const info = await stat(absPath);
		const key = trickplayCacheKey(absPath, info.size, info.mtimeMs);
		const job = this.#jobs.get(key);
		if (job) {
			if (priority === 'high' && job.priority === 'low' && job.state === 'queued') {
				job.priority = 'high';
				this.#pump();
			}
			return { status: job.state === 'running' ? 'generating' : 'queued', geometry: job.geometry };
		}
		const pending = this.#ensuring.get(key);
		if (pending) return pending;
		const task = this.#ensureNew(absPath, key, info.size, info.mtimeMs, priority).finally(() =>
			this.#ensuring.delete(key)
		);
		this.#ensuring.set(key, task);
		return task;
	}

	async #ensureNew(
		absPath: string,
		key: string,
		size: number,
		mtimeMs: number,
		priority: TrickplayPriority
	): Promise<TrickplayEnsureResult> {
		const dir = entryDir(key);
		const manifest = await readManifest(dir);
		if (manifest) return { status: 'ready', geometry: manifest.geometry };
		const remembered = this.#failed.get(key);
		if (remembered) return { status: 'failed', error: remembered };
		if (!this.#opts.ffmpegBin()) return { status: 'failed', error: 'ffmpeg unavailable' };
		// A folder without a manifest is a run that died mid-way: start over.
		if (await entryExists(dir)) await clearEntry(dir);
		const src = await probeTrickplaySource(absPath);
		if (!src) return this.#fail(key, 'ffprobe could not read the file');
		const geometry = computeGeometry(src, src.durationMs);
		if (geometry.tiles === 0) return this.#fail(key, 'file has no duration');
		await ensureEntryDir(dir);
		const job: Job = {
			key,
			absPath,
			dir,
			size,
			mtimeMs,
			geometry,
			hdr: src.hdr,
			priority,
			state: 'queued'
		};
		this.#jobs.set(key, job);
		this.#queue.push(job);
		this.#pump();
		return { status: 'queued', geometry };
	}

	/**
	 * Absolute path of a finished sheet. While the job runs, waits (bounded)
	 * for the sheet ffmpeg is writing next; sheets further ahead fail at once
	 * so a hover doesn't pin a request for minutes.
	 */
	async waitForSheet(
		absPath: string,
		sheet: number,
		opts: { timeoutMs: number; signal?: AbortSignal }
	): Promise<string> {
		const info = await stat(absPath);
		const key = trickplayCacheKey(absPath, info.size, info.mtimeMs);
		const dir = entryDir(key);
		const path = sheetPath(dir, sheet);
		const manifest = await readManifest(dir);
		if (manifest) {
			if (sheet < manifest.geometry.sheets && (await sheetComplete(path))) return path;
			throw new Error('no such sheet');
		}
		const job = this.#jobs.get(key);
		if (!job) {
			const remembered = this.#failed.get(key);
			throw new Error(remembered ? `generation failed: ${remembered}` : 'not generated');
		}
		if (sheet >= job.geometry.sheets) throw new Error('no such sheet');
		if (sheet > (await countSheets(dir))) throw new Error('not ready');

		const deadline = Date.now() + opts.timeoutMs;
		for (;;) {
			if (await sheetComplete(path)) return path;
			if (opts.signal?.aborted) throw new Error('cancelled');
			if (!this.#jobs.has(key)) {
				// Finished or failed while we polled.
				if (await sheetComplete(path)) return path;
				const remembered = this.#failed.get(key);
				throw new Error(remembered ? `generation failed: ${remembered}` : 'no such sheet');
			}
			if (Date.now() >= deadline) throw new Error('not ready');
			await sleep(SHEET_POLL_MS, opts.signal);
		}
	}

	#fail(key: string, error: string): TrickplayEnsureResult {
		this.#failed.set(key, error);
		if (this.#failed.size > MAX_REMEMBERED_FAILURES) {
			const oldest = this.#failed.keys().next().value;
			if (oldest !== undefined) this.#failed.delete(oldest);
		}
		return { status: 'failed', error };
	}

	#pump(): void {
		for (;;) {
			let job: Job | undefined;
			if (this.#running.high < 1) job = this.#queue.find((j) => j.priority === 'high');
			if (!job && this.#running.low < 1) job = this.#queue.find((j) => j.priority === 'low');
			if (!job) return;
			this.#queue.splice(this.#queue.indexOf(job), 1);
			void this.#run(job);
		}
	}

	async #run(job: Job): Promise<void> {
		const lane = job.priority;
		job.state = 'running';
		this.#running[lane]++;
		const bin = this.#opts.ffmpegBin();
		try {
			if (!bin) throw new Error('ffmpeg unavailable');
			const error = await this.#spawn(bin, job);
			if (error) throw new Error(error);
			const sheets = await countSheets(job.dir);
			if (sheets === 0) throw new Error('ffmpeg produced no sheets');
			await writeManifest(job.dir, {
				version: 1,
				source: { absPath: job.absPath, size: job.size, mtimeMs: job.mtimeMs },
				geometry: { ...job.geometry, sheets },
				createdAt: new Date().toISOString()
			});
			this.#opts.log(`trickplay ready for ${job.absPath} (${sheets} sheets)`);
		} catch (err) {
			const message = (err as Error).message;
			this.#opts.log(`trickplay failed for ${job.absPath}: ${message}`);
			await clearEntry(job.dir);
			this.#fail(job.key, message);
		} finally {
			this.#jobs.delete(job.key);
			this.#running[lane]--;
			this.#pump();
		}
	}

	/** Run ffmpeg to completion; resolves with an error message, or null on success. */
	#spawn(bin: string, job: Job): Promise<string | null> {
		const args = trickplayArgs({
			absPath: job.absPath,
			dir: job.dir,
			geometry: job.geometry,
			hdr: job.hdr
		});
		this.#opts.log(`trickplay generating ${job.absPath} (${job.priority} priority)`);
		return new Promise((resolveExit) => {
			const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
			try {
				// nice 19 / IDLE_PRIORITY_CLASS: a transcode on the same device comes first.
				if (proc.pid) setPriority(proc.pid, osConstants.priority.PRIORITY_LOW);
			} catch {
				// unsupported here; run at normal priority
			}
			let stderr = '';
			proc.stderr?.on('data', (chunk: Buffer) => {
				stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
			});
			proc.on('exit', (code, signal) => {
				if (code === 0) {
					resolveExit(null);
					return;
				}
				resolveExit(
					stderr.trim() ||
						(code === null
							? `ffmpeg killed by ${signal ?? 'signal'}`
							: `ffmpeg exited with code ${code}`)
				);
			});
			proc.on('error', (err) => resolveExit(err.message));
		});
	}
}
