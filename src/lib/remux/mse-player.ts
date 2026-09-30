/**
 * Plays a file the browser can decode but not open (MKV, …) by
 * remuxing it client-side into a MediaSource on a plain <video>. Reads the
 * file with HTTP range requests (the session's `/file` route), keeps a
 * buffer-ahead window, and restarts the remux from the nearest key frame when
 * the viewer seeks outside what the current run is producing.
 *
 * Concurrency rules (each one fixed a real bug in the first cut):
 *  - every SourceBuffer operation goes through one queue (#sbOp) — two
 *    overlapping appends throw InvalidStateError;
 *  - a run only appends while its generation is current, so an aborted run
 *    can't write into the buffer of its successor;
 *  - restarts are coalesced (#seekTo): a burst of seeks produces one run at
 *    the last position, never two concurrent runs;
 *  - "is this position covered?" means buffered, or between what the current
 *    run appended and what it has read — never "since the run started",
 *    because eviction drops the part behind the playhead.
 */

import { Input, MATROSKA, MP4, QTFF, UrlSource, WEBM, canEncodeAudio } from 'mediabunny';
import {
	pickTracks,
	remuxMimeType,
	runRemux,
	type AudioAction,
	type RemuxTracks
} from './pipeline';

export interface RemuxPlayerOptions {
	/** Index into the file's audio tracks (default 0). */
	audioIndex?: number;
	/** Converted audio: 6 keeps 5.1, 2 mixes down to stereo (default). Copied audio is untouched. */
	audioChannels?: 2 | 6;
	/** Seconds of media to keep buffered ahead of the playhead (default 60). */
	bufferAhead?: number;
	/** Seconds kept behind the playhead before eviction (default 30). */
	keepBehind?: number;
	onError?: (error: Error) => void;
	onLog?: (message: string) => void;
}

export interface RemuxPlan {
	mimeType: string;
	audioAction: AudioAction;
	videoCodec: string | null;
	audioCodec: string | null;
	duration: number;
}

type MediaSourceCtor = typeof MediaSource;

function mediaSourceCtor(): MediaSourceCtor | null {
	const w = globalThis as unknown as {
		ManagedMediaSource?: MediaSourceCtor;
		MediaSource?: MediaSourceCtor;
	};
	return w.MediaSource ?? w.ManagedMediaSource ?? null;
}

/** Can this browser take the audio as-is, or does it need a conversion, and to what? */
async function chooseAudioAction(
	tracks: RemuxTracks,
	MS: MediaSourceCtor,
	channels: 2 | 6
): Promise<AudioAction> {
	if (!tracks.audio) return 'none';
	const copied = await tracks.audio.getCodecParameterString();
	if (copied && MS.isTypeSupported(`audio/mp4; codecs="${copied}"`)) return 'copy';
	const sampleRate = tracks.audio.sampleRate;
	if (channels === 6) {
		// 5.1 was promised to a surround viewer: Opus or nothing (the page then
		// falls back to the transcoder, which outputs 5.1 — never a silent stereo).
		if (
			tracks.audio.numberOfChannels === 6 &&
			MS.isTypeSupported('audio/mp4; codecs="opus"') &&
			(await canEncodeAudio('opus', { numberOfChannels: 6, sampleRate: 48000 }))
		) {
			return 'opus';
		}
		throw new Error(`can't convert ${tracks.audio.codec} to 5.1 in this browser`);
	}
	if (
		MS.isTypeSupported('audio/mp4; codecs="opus"') &&
		(await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000 }))
	) {
		return 'opus';
	}
	if (
		MS.isTypeSupported('audio/mp4; codecs="mp4a.40.2"') &&
		(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate }))
	) {
		return 'aac';
	}
	throw new Error(`no way to play ${tracks.audio.codec} audio in this browser`);
}

interface Run {
	gen: number;
	ac: AbortController;
	done: Promise<void>;
	/** Where the run was asked to start (the key frame is at or before it). */
	from: number;
	/** Timestamp of the last video packet handed to the muxer. */
	pumped: number;
	/** End of the buffered range this run is extending (what the viewer can play). */
	appendedEnd: number;
	finished: boolean;
}

/** Seconds a playhead may sit still, uncovered, before the watchdog restarts at it. */
const STALL_RESTART_S = 1.5;
/** Seconds stalled on "covered" data before restarting anyway (safety net). */
const STALL_HARD_S = 8;

export class RemuxPlayer {
	readonly #video: HTMLVideoElement;
	readonly #url: string;
	readonly #opts: Required<Omit<RemuxPlayerOptions, 'onError' | 'onLog'>> &
		Pick<RemuxPlayerOptions, 'onError' | 'onLog'>;
	#ms: MediaSource | null = null;
	#objectUrl: string | null = null;
	#sb: SourceBuffer | null = null;
	#sbQueue: Promise<void> = Promise.resolve();
	#input: Input | null = null;
	#tracks: RemuxTracks | null = null;
	#plan: RemuxPlan | null = null;
	#run: Run | null = null;
	#gen = 0;
	/** Latest requested restart position; consumed by the #seekTo loop. */
	#target: number | null = null;
	#restarting = false;
	#destroyed = false;
	#wake: (() => void) | null = null;
	#watchdog: ReturnType<typeof setInterval> | null = null;
	#lastProgress = { time: -1, at: 0 };

	constructor(video: HTMLVideoElement, url: string, opts: RemuxPlayerOptions = {}) {
		this.#video = video;
		this.#url = url;
		this.#opts = { audioIndex: 0, audioChannels: 2, bufferAhead: 60, keepBehind: 30, ...opts };
	}

	get plan(): RemuxPlan | null {
		return this.#plan;
	}

	/** Open the file, decide the audio path and check MSE support. Throws when the browser can't play it. */
	async prepare(): Promise<RemuxPlan> {
		const MS = mediaSourceCtor();
		if (!MS) throw new Error('this browser has no Media Source Extensions');
		this.#input = new Input({
			source: new UrlSource(this.#url, { maxCacheSize: 32 * 1024 * 1024 }),
			// Only the demuxers remux uses (the containers `remuxPlan` accepts): a smaller chunk.
			formats: [MATROSKA, WEBM, MP4, QTFF]
		});
		this.#tracks = await pickTracks(this.#input, this.#opts.audioIndex);
		const audioAction = await chooseAudioAction(this.#tracks, MS, this.#opts.audioChannels);
		if (audioAction !== 'copy' && audioAction !== 'none') {
			const codec = this.#tracks.audio?.codec;
			if (codec === 'ac3' || codec === 'eac3') {
				const { registerAc3Decoder } = await import('@mediabunny/ac3');
				registerAc3Decoder();
			}
		}
		const mimeType = await remuxMimeType(this.#tracks, audioAction);
		if (!MS.isTypeSupported(mimeType)) {
			throw new Error(`this browser can't play ${mimeType} through MSE`);
		}
		this.#plan = {
			mimeType,
			audioAction,
			videoCodec: await this.#tracks.video.getCodecParameterString(),
			audioCodec: this.#tracks.audio ? await this.#tracks.audio.getCodecParameterString() : null,
			duration: await this.#input.computeDuration()
		};
		return this.#plan;
	}

	/** Attach to the <video> and start producing media at `at` seconds. */
	async start(at = 0): Promise<void> {
		const plan = this.#plan ?? (await this.prepare());
		if (this.#destroyed) return;
		const MS = mediaSourceCtor()!;
		const ms = new MS();
		this.#ms = ms;
		if ('ManagedMediaSource' in globalThis && MS !== globalThis.MediaSource) {
			this.#video.disableRemotePlayback = true;
		}
		// Listen before the element has a source: a seek made while it's still
		// loading must not be lost (it lands once metadata is known).
		this.#video.addEventListener('seeking', this.#onSeeking);
		this.#video.addEventListener('timeupdate', this.#onTick);
		this.#objectUrl = URL.createObjectURL(ms);
		this.#video.src = this.#objectUrl;
		await new Promise<void>((resolve) =>
			ms.addEventListener('sourceopen', () => resolve(), { once: true })
		);
		if (this.#destroyed) return;
		ms.duration = plan.duration;
		this.#watchdog = setInterval(this.#checkStall, 500);
		if (at > 0) this.#video.currentTime = at;
		this.#seekTo(at);
	}

	destroy(): void {
		this.#destroyed = true;
		this.#gen++;
		this.#run?.ac.abort();
		this.#wake?.();
		if (this.#watchdog) clearInterval(this.#watchdog);
		this.#video.removeEventListener('seeking', this.#onSeeking);
		this.#video.removeEventListener('timeupdate', this.#onTick);
		this.#input?.dispose();
		if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
		this.#video.removeAttribute('src');
		this.#video.load();
	}

	/** Buffered ranges, for the debug overlay. */
	buffered(): [number, number][] {
		const out: [number, number][] = [];
		let b: TimeRanges | undefined;
		try {
			b = this.#sb?.buffered;
		} catch {
			return out; // SourceBuffer detached (destroyed)
		}
		if (!b) return out;
		for (let i = 0; i < b.length; i++) out.push([b.start(i), b.end(i)]);
		return out;
	}

	#log(message: string): void {
		this.#opts.onLog?.(message);
	}

	// ── restarts ───────────────────────────────────────────────────────────

	/** Request a run starting at `t`. Coalesces: only the latest target of a burst runs. */
	#seekTo(t: number): void {
		this.#target = t;
		if (this.#restarting) return;
		this.#restarting = true;
		void this.#restartLoop().finally(() => {
			this.#restarting = false;
		});
	}

	async #restartLoop(): Promise<void> {
		while (this.#target !== null && !this.#destroyed) {
			const at = this.#target;
			this.#target = null;
			const old = this.#run;
			// Same position as the run already producing (e.g. the seeking event of
			// a resume start): nothing to do.
			if (old && !old.finished && Math.abs(old.from - at) < 0.25) continue;
			this.#run = null;
			this.#gen++;
			if (old) {
				old.ac.abort();
				this.#wake?.();
				await old.done;
			}
			if (this.#destroyed) return;
			// A newer seek arrived while the old run wound down: skip straight to it.
			if (this.#target !== null) continue;
			await this.#sbOp((sb, ms) => {
				// Drop the parser state of the aborted run (a half-appended fragment).
				if (ms.readyState === 'open') sb.abort();
			});
			this.#log(`run from ${at.toFixed(1)}s`);
			this.#startRun(at);
		}
	}

	#startRun(from: number): void {
		const gen = this.#gen;
		const ac = new AbortController();
		const run: Run = {
			gen,
			ac,
			from,
			pumped: from,
			appendedEnd: from,
			finished: false,
			done: Promise.resolve()
		};
		this.#run = run;
		const current = () => this.#gen === gen && !this.#destroyed;
		run.done = runRemux(this.#tracks!, {
			start: from,
			audioAction: this.#plan!.audioAction,
			audioChannels: this.#opts.audioChannels,
			signal: ac.signal,
			onInit: async (init, mime) => {
				if (!current()) return;
				if (!this.#sb) {
					this.#log(`SourceBuffer ${mime}`);
					this.#sb = this.#ms!.addSourceBuffer(mime);
					this.#sb.mode = 'segments';
				}
				await this.#append(init, current);
			},
			onSegment: async (data, timestamp) => {
				if (!current()) return;
				await this.#append(data, current);
				const range = this.buffered().find(([s, e]) => timestamp >= s - 0.5 && timestamp <= e);
				if (range) run.appendedEnd = range[1];
			},
			waitForRoom: async (position) => {
				run.pumped = position;
				await this.#waitForRoom(position, ac.signal);
			}
		}).then(
			() => {
				run.finished = true;
				if (!current()) return;
				this.#log(`run from ${from.toFixed(1)}s reached the end`);
				void this.#sbOp((sb, ms) => {
					if (ms.readyState === 'open' && this.#run === run) ms.endOfStream();
				});
			},
			(err: unknown) => {
				run.finished = true;
				if (ac.signal.aborted || !current()) return;
				this.#fail(err);
			}
		);
	}

	// ── seeking & stalls ───────────────────────────────────────────────────

	/** Will playback at `t` be served without a restart? */
	#covered(t: number): boolean {
		if (this.buffered().some(([s, e]) => t >= s - 0.1 && t < e - 0.1)) return true;
		const run = this.#run;
		// Ahead of what's buffered but inside what the current run is about to deliver.
		return !!run && !run.finished && t >= run.appendedEnd - 0.5 && t <= run.pumped + 2;
	}

	#onSeeking = (): void => {
		if (this.#destroyed || !this.#sb) {
			// Still starting: make the pending/next run start here instead.
			if (this.#ms?.readyState === 'open') this.#seekTo(this.#video.currentTime);
			return;
		}
		const t = this.#video.currentTime;
		this.#lastProgress = { time: t, at: performance.now() };
		if (!this.#covered(t)) this.#seekTo(t);
		else this.#wake?.();
	};

	#onTick = (): void => {
		this.#wake?.();
	};

	/** Watchdog: a playhead that should be moving but isn't, on data nobody will deliver. */
	#checkStall = (): void => {
		const v = this.#video;
		if (this.#destroyed || v.paused || v.ended || this.#restarting) {
			this.#lastProgress = { time: v.currentTime, at: performance.now() };
			return;
		}
		const now = performance.now();
		if (v.currentTime !== this.#lastProgress.time) {
			this.#lastProgress = { time: v.currentTime, at: now };
			return;
		}
		const stalled = (now - this.#lastProgress.at) / 1000;
		const t = v.currentTime;
		if ((stalled > STALL_RESTART_S && !this.#covered(t)) || stalled > STALL_HARD_S) {
			this.#log(`stalled ${stalled.toFixed(1)}s at ${t.toFixed(1)}s, restarting`);
			this.#lastProgress = { time: t, at: now };
			this.#seekTo(t);
		}
	};

	// ── buffer management ──────────────────────────────────────────────────

	async #waitForRoom(position: number, signal: AbortSignal): Promise<void> {
		while (!signal.aborted && position - this.#video.currentTime > this.#opts.bufferAhead) {
			await this.#evict();
			await new Promise<void>((resolve) => {
				const timer = setTimeout(resolve, 500);
				this.#wake = () => {
					clearTimeout(timer);
					resolve();
				};
			});
			this.#wake = null;
		}
	}

	/** Drop everything outside [playhead − keepBehind, playhead + bufferAhead + slack]. */
	#evict(): Promise<void> {
		return this.#sbOp((sb, ms) => {
			if (ms.readyState !== 'open') return;
			const t = this.#video.currentTime;
			const keepFrom = t - this.#opts.keepBehind;
			const keepTo = t + this.#opts.bufferAhead + 30;
			const ranges = this.buffered();
			const first = ranges[0];
			const last = ranges.at(-1);
			if (first && first[0] < keepFrom - 1) return sb.remove(0, keepFrom);
			if (last && last[1] > keepTo + 1) return sb.remove(keepTo, Infinity);
		});
	}

	/**
	 * Run one SourceBuffer operation after every earlier one finished. An
	 * operation that starts an async update (append/remove) returns nothing;
	 * the queue waits for its `updateend`.
	 */
	#sbOp(op: (sb: SourceBuffer, ms: MediaSource) => void): Promise<void> {
		const next = this.#sbQueue.then(async () => {
			const sb = this.#sb;
			const ms = this.#ms;
			if (!sb || !ms || this.#destroyed) return;
			await idle(sb);
			op(sb, ms);
			await idle(sb);
		});
		this.#sbQueue = next.catch(() => {});
		return next;
	}

	async #append(data: Uint8Array, current: () => boolean): Promise<void> {
		for (let attempt = 0; ; attempt++) {
			try {
				// (Appending also re-opens an ended MediaSource: seek back after the end.)
				await this.#sbOp((sb) => {
					if (current()) sb.appendBuffer(data as Uint8Array<ArrayBuffer>);
				});
				return;
			} catch (err) {
				if ((err as DOMException).name === 'QuotaExceededError' && attempt < 3) {
					this.#log('quota exceeded, evicting');
					await this.#evict();
					continue;
				}
				throw err;
			}
		}
	}

	#fail(err: unknown): void {
		const error = err instanceof Error ? err : new Error(String(err));
		this.#log(`error: ${error.message}`);
		this.#opts.onError?.(error);
	}
}

function idle(sb: SourceBuffer): Promise<void> {
	if (!sb.updating) return Promise.resolve();
	return new Promise((resolve) =>
		sb.addEventListener('updateend', () => resolve(), { once: true })
	);
}
