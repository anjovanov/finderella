import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transcodeDir } from '../config.js';
import { hdrTonemapAvailable, isHdrTransfer, probeVideoStream } from '../probe.js';
import { killAndWait } from '../process.js';
import { hlsArgs, type TranscodeQuality } from './ffmpeg.js';
import { accelFitsQuality, type HwAccel } from './hwaccel.js';
import { parseInitTimescales, patchSegmentTfdt } from './mp4-patch.js';
import { segmentsToPrune } from './prune.js';

const MAX_AHEAD_SEGMENTS = 8;
const SEGMENT_WAIT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;
const IDLE_REAP_MS = 120_000;
/** How long start() watches a fresh ffmpeg for an immediate failure. */
const EARLY_EXIT_GRACE_MS = 1_500;
const STDERR_TAIL_CHARS = 4_000;
/** A session folder untouched this long is left over from a crash (live ones change every few seconds). */
const STALE_DIR_MS = 10 * 60_000;

export interface TranscodeOptions {
	sessionId: string;
	absPath: string;
	segmentSeconds: number;
	durationMs: number;
	quality: TranscodeQuality;
	/** Absolute ffprobe index of the audio stream to encode; absent = the first one. */
	audioStreamIndex?: number;
	/** Output audio channels; absent = stereo. */
	audioChannels?: 1 | 2 | 6;
	ffmpegBin: string;
	/** GPU accelerator (`hwAccel()`); absent/null = software. A GPU that fails at start falls back to it. */
	hwaccel?: HwAccel | null;
	log: (message: string) => void;
	/** Called when the session self-reaps (idle) so the owner can drop it. */
	onReap: () => void;
}

/**
 * One HLS transcode session: an ffmpeg process writing 4s fmp4 segments to a
 * per-session folder under `transcodeDir()` (on disk, never tmpfs `/tmp`).
 * Segments well behind the playhead are deleted as playback moves on. A segment is "ready" once it appears in ffmpeg's own
 * playlist (files exist before they're finalized) — which is why hlsArgs uses
 * the `event` playlist type: `vod` writes that playlist only on exit, so
 * nothing would ever be ready. Requesting a segment
 * outside the produced window kills and restarts ffmpeg at that point —
 * that's how seeking works; the hub and browser never know.
 */
export class TranscodeSession {
	readonly dir: string;
	#opts: TranscodeOptions;
	#proc: ChildProcess | null = null;
	/** Resolves when the current run exits. */
	#exited: Promise<void> = Promise.resolve();
	/** Resolves once every run we killed has exited. */
	#dying: Promise<void> = Promise.resolve();
	/** A launch is waiting for the previous run to die: ffmpeg counts as running. */
	#launching = false;
	#procError: string | null = null;
	#startSegment = 0;
	#hdr = false;
	#sourceCodec: string | null = null;
	/** Cleared when the first GPU run fails at start: the session runs on the CPU. */
	#hwaccel: HwAccel | null;
	#stopped = false;
	#lastAccess = Date.now();
	#reapTimer: NodeJS.Timeout;
	// Per-run bookkeeping for tfdt patching (each ffmpeg run is 0-based).
	#runToken = 0;
	#patched = new Set<number>();
	/** Segments of this run deleted behind the playhead; asking for one again restarts there. */
	#pruned = new Set<number>();
	#timescales: Map<number, number> | null = null;

	constructor(opts: TranscodeOptions) {
		this.#opts = opts;
		this.dir = join(transcodeDir(), opts.sessionId);
		// A plan wider than the encoder handles (Pi 4 at 4K) keeps the hub's level promise in software.
		this.#hwaccel =
			opts.hwaccel && accelFitsQuality(opts.hwaccel, opts.quality) ? opts.hwaccel : null;
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

	/**
	 * Launch ffmpeg. Resolves once the process has survived a short grace
	 * period, so an input ffmpeg rejects outright (unreadable file, unknown
	 * codec) fails the hub's session.start request with ffmpeg's own stderr
	 * instead of surfacing 30s later as a segment timeout.
	 */
	async start(startSegment = 0): Promise<void> {
		await mkdir(this.dir, { recursive: true });
		// One cheap probe per session: HDR sources need tone-mapping on every run,
		// and codec-limited GPU decoders (the Pi's HEVC-only one) need the codec.
		const video = await probeVideoStream(this.#opts.absPath);
		this.#sourceCodec = video.codec;
		const hdr = isHdrTransfer(video.transfer);
		this.#hdr = hdr && hdrTonemapAvailable();
		if (this.#hdr) this.#opts.log(`tone-mapping HDR source (${this.#opts.sessionId})`);
		else if (hdr) {
			this.#opts.log(
				`HDR source but this ffmpeg lacks zscale/tonemap; transcoding without tone-mapping (${this.#opts.sessionId})`
			);
		}
		await this.#launch(startSegment);
		await this.#survivesGrace();
		if (this.#procError && this.#hwaccel) {
			// NVENC session limit, a busy or sleeping GPU, a source the driver
			// rejects. Only here, before the player has fetched init.mp4: a GPU and
			// a libx264 run have different SPS/PPS, libx264 doesn't repeat them in
			// segments, and hls.js never re-fetches init — so a GPU failure later in
			// the session fails like any ffmpeg error and a new session starts clean.
			this.#opts.log(
				`GPU transcode failed (${this.#opts.sessionId}): ${this.#procError}; using the CPU`
			);
			this.#hwaccel = null;
			await this.#launch(startSegment);
			await this.#survivesGrace();
		}
		if (this.#procError) throw new Error(this.#procError);
	}

	async #survivesGrace(): Promise<void> {
		await Promise.race([
			this.#exited,
			new Promise((resolveWait) => setTimeout(resolveWait, EARLY_EXIT_GRACE_MS))
		]);
	}

	/**
	 * Start a new ffmpeg run at `startSegment`, after the previous run has
	 * really exited (Windows keeps a killed process's files open for a moment).
	 * The window moves at once so concurrent requests don't launch again; a
	 * newer launch that arrives while this one waits supersedes it.
	 */
	async #launch(startSegment: number): Promise<void> {
		this.#startSegment = startSegment;
		this.#procError = null;
		const token = ++this.#runToken;
		this.#patched.clear();
		this.#pruned.clear();
		this.#timescales = null;
		this.#launching = true;
		await this.#killProc();
		if (token !== this.#runToken || this.#stopped) return;
		// The dead run's playlist would list its segments as ready until the new
		// run writes its own.
		await rm(join(this.dir, 'playlist.m3u8'), { force: true }).catch(() => {});
		if (token !== this.#runToken || this.#stopped) return;
		this.#launching = false;
		const args = hlsArgs({
			absPath: this.#opts.absPath,
			dir: this.dir,
			startSegment,
			segmentSeconds: this.#opts.segmentSeconds,
			quality: this.#opts.quality,
			hdr: this.#hdr,
			audioStreamIndex: this.#opts.audioStreamIndex,
			audioChannels: this.#opts.audioChannels,
			hwaccel: this.#hwaccel ?? undefined,
			sourceCodec: this.#sourceCodec
		});
		this.#opts.log(
			`ffmpeg starting at segment ${startSegment} (${this.#opts.sessionId}${this.#hwaccel ? `, ${this.#hwaccel.label}` : ''})`
		);
		const proc = spawn(this.#opts.ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
		let stderr = '';
		proc.stderr?.on('data', (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
		});
		const exited = new Promise<void>((resolveExit) => {
			proc.on('exit', (code, signal) => {
				// A run we killed ourselves (seek restart / stop) has already been
				// detached from #proc; only the live run's exit is an error.
				const isCurrent = this.#proc === proc;
				if (isCurrent) this.#proc = null;
				if (isCurrent && code !== 0 && !this.#stopped) {
					this.#procError =
						stderr.trim() ||
						(code === null
							? `ffmpeg killed by ${signal ?? 'signal'}`
							: `ffmpeg exited with code ${code}`);
					this.#opts.log(`ffmpeg failed (${this.#opts.sessionId}): ${this.#procError}`);
				}
				resolveExit();
			});
			proc.on('error', (err) => {
				this.#procError = err.message;
				if (this.#proc === proc) this.#proc = null;
				resolveExit();
			});
		});
		this.#proc = proc;
		this.#exited = exited;
	}

	/** Segments of the current run that are finished and still on disk. */
	async #playlistSegments(): Promise<Set<number>> {
		try {
			const playlist = await readFile(join(this.dir, 'playlist.m3u8'), 'utf8');
			const listed = [...playlist.matchAll(/^seg-(\d+)\.m4s\r?$/gm)].map((match) =>
				Number(match[1])
			);
			return new Set(listed.filter((n) => !this.#pruned.has(n)));
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
			if (
				!produced.has(n) &&
				(n < this.#startSegment || n > head + MAX_AHEAD_SEGMENTS || this.#pruned.has(n))
			) {
				await this.#launch(n);
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
			if (!this.#proc && !this.#procError && !this.#launching) {
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

		if (wantedSegment) {
			const n = Number(wantedSegment[1]);
			await this.#patchIfNeeded(n);
			await this.#prune(n);
		}
		return join(this.dir, name);
	}

	/** Delete segments far behind the one just served (any run's), so the folder stays small. */
	async #prune(servedSegment: number): Promise<void> {
		let names: string[];
		try {
			names = await readdir(this.dir);
		} catch {
			return;
		}
		for (const n of segmentsToPrune(names, servedSegment)) {
			this.#pruned.add(n);
			this.#patched.delete(n);
			await rm(join(this.dir, `seg-${n}.m4s`), { force: true }).catch(() => {});
		}
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

	/** Detach and kill the current run, resolving once every killed run has exited (bounded). */
	async #killProc(): Promise<void> {
		const proc = this.#proc;
		if (proc) {
			this.#proc = null;
			const previous = this.#dying;
			this.#dying = Promise.all([previous, killAndWait(proc)]).then(() => {});
		}
		await this.#dying;
	}

	async stop(): Promise<void> {
		if (this.#stopped) return;
		this.#stopped = true;
		clearInterval(this.#reapTimer);
		await this.#killProc();
		// maxRetries covers Windows EBUSY/EPERM while handles close.
		await rm(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
			(err: Error) => this.#opts.log(`could not remove ${this.dir}: ${err.message}`)
		);
	}
}

/**
 * Startup housekeeping: remove session folders a crash or a failed delete
 * left behind, plus the pre-`transcodeDir` scratch under `tmpdir()/finderella`
 * (after a day: an older gateway on this machine may still be using it).
 * Age-gated, so a second gateway sharing the folder keeps its live sessions.
 */
export async function sweepTranscodeScratch(
	roots: { dir: string; maxAgeMs: number }[] = [
		{ dir: transcodeDir(), maxAgeMs: STALE_DIR_MS },
		{ dir: join(tmpdir(), 'finderella'), maxAgeMs: 24 * 60 * 60_000 }
	],
	now = Date.now()
): Promise<number> {
	let removed = 0;
	for (const { dir: root, maxAgeMs } of roots) {
		let names: string[];
		try {
			names = await readdir(root);
		} catch {
			continue;
		}
		for (const name of names) {
			const path = join(root, name);
			const info = await stat(path).catch(() => null);
			if (!info || now - info.mtimeMs < maxAgeMs) continue;
			await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).then(
				() => removed++,
				() => {}
			);
		}
	}
	return removed;
}
