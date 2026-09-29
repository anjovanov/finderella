import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { constants as osConstants, setPriority } from 'node:os';
import {
	encodeFingerprint,
	type MarkersAnalysis,
	type MarkersAnalyzeResult
} from '@finderella/protocol';
import { readAnalysis, writeAnalysis } from './cache.js';
import { parseBlackframeOutput } from './darkframes.js';
import { darkframeArgs, pcmArgs } from './ffmpeg.js';
import { FINGERPRINT_VERSION, Fingerprinter, HOP_MS } from './fingerprint.js';
import { markersCacheKey, type MarkersSpec } from './spec.js';

interface Job {
	key: string;
	absPath: string;
	spec: MarkersSpec;
	state: 'queued' | 'running';
}

interface QueueOptions {
	ffmpegBin: () => string | null;
	log: (message: string) => void;
}

const STDERR_TAIL_CHARS = 2000;
/** The dark-frame printout is a few lines per keyframe; anything far beyond is a runaway. */
const MAX_DARKFRAME_OUTPUT = 4 * 1024 * 1024;
const MAX_REMEMBERED_FAILURES = 200;

/**
 * Intro/credits analysis jobs for the device: one ffmpeg at a time, at the
 * lowest OS priority (it's background work — a transcode comes first).
 * Single-flight per (file identity, request); results are cached on disk, so
 * the hub can re-fetch a season's analyses whenever it re-compares them.
 * Jobs aren't cancelled when the hub disconnects: the cache still fills.
 */
export class MarkersQueue {
	#opts: QueueOptions;
	#jobs = new Map<string, Job>();
	#queue: Job[] = [];
	#running = false;
	#failed = new Map<string, string>();

	constructor(opts: QueueOptions) {
		this.#opts = opts;
	}

	async ensure(absPath: string, spec: MarkersSpec): Promise<MarkersAnalyzeResult> {
		const info = await stat(absPath);
		const key = markersCacheKey(absPath, info.size, info.mtimeMs, spec);
		const job = this.#jobs.get(key);
		if (job) return { status: job.state };
		const cached = await readAnalysis(key);
		if (cached) return { status: 'ready', analysis: cached };
		// Re-check: the job may have been created while the cache read was pending.
		const raced = this.#jobs.get(key);
		if (raced) return { status: raced.state };
		const remembered = this.#failed.get(key);
		if (remembered) return { status: 'failed', error: remembered };
		if (!this.#opts.ffmpegBin()) return { status: 'failed', error: 'ffmpeg unavailable' };
		if (spec.regions.length === 0 && !spec.darkframes) {
			return this.#fail(key, 'nothing to analyze');
		}
		const created: Job = { key, absPath, spec, state: 'queued' };
		this.#jobs.set(key, created);
		this.#queue.push(created);
		this.#pump();
		return { status: 'queued' };
	}

	#fail(key: string, error: string): MarkersAnalyzeResult {
		this.#failed.set(key, error);
		if (this.#failed.size > MAX_REMEMBERED_FAILURES) {
			const oldest = this.#failed.keys().next().value;
			if (oldest !== undefined) this.#failed.delete(oldest);
		}
		return { status: 'failed', error };
	}

	#pump(): void {
		if (this.#running) return;
		const job = this.#queue.shift();
		if (!job) return;
		void this.#run(job);
	}

	async #run(job: Job): Promise<void> {
		this.#running = true;
		job.state = 'running';
		const started = Date.now();
		try {
			const bin = this.#opts.ffmpegBin();
			if (!bin) throw new Error('ffmpeg unavailable');
			const analysis = await this.#analyze(bin, job);
			await writeAnalysis(job.key, analysis);
			this.#opts.log(
				`markers analyzed ${job.absPath} in ${((Date.now() - started) / 1000).toFixed(1)}s`
			);
		} catch (err) {
			const message = (err as Error).message;
			this.#opts.log(`markers analysis failed for ${job.absPath}: ${message}`);
			this.#fail(job.key, message);
		} finally {
			this.#jobs.delete(job.key);
			this.#running = false;
			this.#pump();
		}
	}

	async #analyze(bin: string, job: Job): Promise<MarkersAnalysis> {
		const regions: MarkersAnalysis['regions'] = [];
		for (const region of job.spec.regions) {
			const fp = new Fingerprinter();
			await this.#runPcm(
				bin,
				pcmArgs({
					absPath: job.absPath,
					streamIndex: job.spec.audioStreamIndex,
					startMs: region.startMs,
					durationMs: region.durationMs
				}),
				fp
			);
			regions.push({ ...region, fingerprint: encodeFingerprint(fp.finish()) });
		}
		const analysis: MarkersAnalysis = { version: FINGERPRINT_VERSION, hopMs: HOP_MS, regions };
		const window = job.spec.darkframes;
		if (window) {
			const stdout = await this.#runText(bin, darkframeArgs({ absPath: job.absPath, ...window }));
			analysis.darkframes = parseBlackframeOutput(stdout, window.startMs);
		}
		return analysis;
	}

	/** Stream f32le PCM from ffmpeg into the fingerprinter. */
	#runPcm(bin: string, args: string[], fp: Fingerprinter): Promise<void> {
		let carry = Buffer.alloc(0);
		return this.#spawn(bin, args, (chunk) => {
			const data = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
			const count = Math.floor(data.length / 4);
			const samples = new Float32Array(count);
			for (let i = 0; i < count; i++) samples[i] = data.readFloatLE(i * 4);
			fp.push(samples);
			carry = Buffer.from(data.subarray(count * 4));
		});
	}

	async #runText(bin: string, args: string[]): Promise<string> {
		let out = '';
		await this.#spawn(bin, args, (chunk) => {
			if (out.length < MAX_DARKFRAME_OUTPUT) out += chunk.toString('utf8');
		});
		return out;
	}

	/** Run ffmpeg to completion; rejects with the stderr tail on failure. */
	#spawn(bin: string, args: string[], onStdout: (chunk: Buffer) => void): Promise<void> {
		return new Promise((resolveExit, rejectExit) => {
			const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
			try {
				// nice 19 / IDLE_PRIORITY_CLASS: playback on the same device comes first.
				if (proc.pid) setPriority(proc.pid, osConstants.priority.PRIORITY_LOW);
			} catch {
				// unsupported here; run at normal priority
			}
			let stderr = '';
			proc.stdout?.on('data', onStdout);
			proc.stderr?.on('data', (chunk: Buffer) => {
				stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
			});
			proc.on('close', (code, signal) => {
				if (code === 0) {
					resolveExit();
					return;
				}
				rejectExit(
					new Error(
						stderr.trim() ||
							(code === null
								? `ffmpeg killed by ${signal ?? 'signal'}`
								: `ffmpeg exited with code ${code}`)
					)
				);
			});
			proc.on('error', (err) => rejectExit(err));
		});
	}
}
