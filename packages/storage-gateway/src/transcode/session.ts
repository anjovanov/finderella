import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hlsArgs } from './ffmpeg.js';
import { parseInitTimescales, patchSegmentTfdt } from './mp4-patch.js';

const MAX_AHEAD_SEGMENTS = 8;
const SEGMENT_WAIT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;
const IDLE_REAP_MS = 120_000;

export interface TranscodeOptions {
	sessionId: string;
	absPath: string;
	segmentSeconds: number;
	durationMs: number;
	ffmpegBin: string;
	log: (message: string) => void;
	/** Called when the session self-reaps (idle) so the owner can drop it. */
	onReap: () => void;
}

/**
 * One HLS transcode session: an ffmpeg process writing 4s fmp4 segments to a
 * per-session temp dir. A segment is "ready" once it appears in ffmpeg's own
 * playlist (files exist before they're finalized). Requesting a segment
 * outside the produced window kills and restarts ffmpeg at that point —
 * that's how seeking works; the hub and browser never know.
 */
export class TranscodeSession {
	readonly dir: string;
	#opts: TranscodeOptions;
	#proc: ChildProcess | null = null;
	#procError: string | null = null;
	#startSegment = 0;
	#stopped = false;
	#lastAccess = Date.now();
	#reapTimer: NodeJS.Timeout;
	// Per-run bookkeeping for tfdt patching (each ffmpeg run is 0-based).
	#runToken = 0;
	#patched = new Set<number>();
	#timescales: Map<number, number> | null = null;

	constructor(opts: TranscodeOptions) {
		this.#opts = opts;
		this.dir = join(tmpdir(), 'finderella', opts.sessionId);
		this.#reapTimer = setInterval(() => {
			if (Date.now() - this.#lastAccess > IDLE_REAP_MS) {
				this.#opts.log(`session ${this.#opts.sessionId} idle; reaping`);
				void this.stop();
				this.#opts.onReap();
			}
		}, IDLE_REAP_MS / 4);
		this.#reapTimer.unref?.();
	}

	get totalSegments(): number {
		return Math.ceil(this.#opts.durationMs / 1000 / this.#opts.segmentSeconds);
	}

	async start(startSegment = 0): Promise<void> {
		await mkdir(this.dir, { recursive: true });
		this.#launch(startSegment);
	}

	#launch(startSegment: number): void {
		this.#killProc();
		this.#startSegment = startSegment;
		this.#procError = null;
		this.#runToken++;
		this.#patched.clear();
		this.#timescales = null;
		const args = hlsArgs({
			absPath: this.#opts.absPath,
			dir: this.dir,
			startSegment,
			segmentSeconds: this.#opts.segmentSeconds
		});
		this.#opts.log(`ffmpeg starting at segment ${startSegment} (${this.#opts.sessionId})`);
		const proc = spawn(this.#opts.ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
		let stderr = '';
		proc.stderr?.on('data', (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-2000);
		});
		proc.on('exit', (code) => {
			if (this.#proc === proc) this.#proc = null;
			if (code !== 0 && code !== null && !this.#stopped) {
				this.#procError = stderr.trim() || `ffmpeg exited with code ${code}`;
				this.#opts.log(`ffmpeg failed (${this.#opts.sessionId}): ${this.#procError}`);
			}
		});
		proc.on('error', (err) => {
			this.#procError = err.message;
			if (this.#proc === proc) this.#proc = null;
		});
		this.#proc = proc;
	}

	async #playlistSegments(): Promise<Set<number>> {
		try {
			const playlist = await readFile(join(this.dir, 'playlist.m3u8'), 'utf8');
			return new Set([...playlist.matchAll(/^seg-(\d+)\.m4s$/gm)].map((match) => Number(match[1])));
		} catch {
			return new Set();
		}
	}

	/** Resolve the absolute path of an asset once it's fully written. */
	async ensureAsset(name: string): Promise<string> {
		this.#lastAccess = Date.now();
		if (this.#stopped) throw new Error('session stopped');

		const wantedSegment = /^seg-(\d+)\.m4s$/.exec(name);
		if (wantedSegment) {
			const n = Number(wantedSegment[1]);
			if (n >= this.totalSegments) throw new Error(`segment ${n} beyond end of media`);
			const produced = await this.#playlistSegments();
			const head = produced.size > 0 ? Math.max(...produced) : this.#startSegment - 1;
			// Outside the window ffmpeg is producing → seek: restart there.
			if (!produced.has(n) && (n < this.#startSegment || n > head + MAX_AHEAD_SEGMENTS)) {
				this.#launch(n);
			}
		}

		const deadline = Date.now() + SEGMENT_WAIT_TIMEOUT_MS;
		for (;;) {
			if (this.#stopped) throw new Error('session stopped');
			if (wantedSegment) {
				const produced = await this.#playlistSegments();
				if (produced.has(Number(wantedSegment[1]))) break;
			} else {
				// init.mp4 is written before the first segment lands in the playlist.
				const produced = await this.#playlistSegments();
				if (produced.size > 0) break;
			}
			if (this.#procError) throw new Error(this.#procError);
			if (!this.#proc && !this.#procError) {
				// ffmpeg finished; whatever the playlist has now is all there is.
				const produced = await this.#playlistSegments();
				if (wantedSegment && !produced.has(Number(wantedSegment[1]))) {
					throw new Error(`segment ${wantedSegment[1]} was never produced`);
				}
				break;
			}
			if (Date.now() > deadline) throw new Error(`timed out waiting for ${name}`);
			await new Promise((resolveWait) => setTimeout(resolveWait, POLL_INTERVAL_MS));
		}

		if (wantedSegment) await this.#patchIfNeeded(Number(wantedSegment[1]));
		return join(this.dir, name);
	}

	/**
	 * ffmpeg runs are 0-based; when this run started mid-file, shift the
	 * segment's tfdt onto the absolute timeline (atomic rewrite, once per
	 * run). A concurrent seek-restart invalidates the patch → caller retries.
	 */
	async #patchIfNeeded(segmentNumber: number): Promise<void> {
		const token = this.#runToken;
		const offsetSeconds = this.#startSegment * this.#opts.segmentSeconds;
		if (offsetSeconds === 0 || this.#patched.has(segmentNumber)) return;
		if (!this.#timescales) {
			this.#timescales = parseInitTimescales(await readFile(join(this.dir, 'init.mp4')));
		}
		const path = join(this.dir, `seg-${segmentNumber}.m4s`);
		const buf = await readFile(path);
		patchSegmentTfdt(buf, this.#timescales, offsetSeconds);
		if (this.#runToken !== token || this.#stopped) throw new Error('session restarted');
		const tmp = `${path}.patch`;
		await writeFile(tmp, buf);
		await rename(tmp, path);
		if (this.#runToken !== token) throw new Error('session restarted');
		this.#patched.add(segmentNumber);
	}

	#killProc(): void {
		if (this.#proc) {
			this.#proc.kill('SIGKILL');
			this.#proc = null;
		}
	}

	async stop(): Promise<void> {
		if (this.#stopped) return;
		this.#stopped = true;
		clearInterval(this.#reapTimer);
		this.#killProc();
		await rm(this.dir, { recursive: true, force: true }).catch(() => {});
	}
}
