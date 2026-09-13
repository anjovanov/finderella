import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { decodeSubtitleText, normalizeVtt, srtToVtt, subtitleArgs } from './convert.js';

/** Converted tracks live here, keyed by source identity; a big MKV is demuxed once. */
export const SUBTITLE_CACHE_DIR = join(tmpdir(), 'finderella', 'subs');
/** ffmpeg extractions in flight at once — they read whole containers, so keep them from starving HLS. */
const MAX_CONCURRENT_EXTRACTIONS = 2;
const STDERR_TAIL_CHARS = 2000;
const TAIL_READ_BYTES = 256 * 1024;
const TAIL_POLL_MS = 150;

export interface SubtitleJob {
	absVideoPath: string;
	source: 'embedded' | 'sidecar';
	/** ffprobe's absolute stream index (embedded). */
	streamIndex?: number;
	/** Absolute sidecar path (sidecar). */
	absSidecarPath?: string;
}

export interface SubtitleHandle {
	/** File to read: the finished `.vtt`, or the growing `.part` while ffmpeg runs. */
	path: string;
	/** True when `path` is complete already (serve it like any file). */
	complete: boolean;
	/** Resolves with the finished file's path; rejects when conversion failed. */
	done: Promise<string>;
}

interface ExtractOptions {
	ffmpegBin: string | null;
	log: (message: string) => void;
}

const inflight = new Map<string, SubtitleHandle>();
let running = 0;

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function cacheKey(job: SubtitleJob): Promise<string> {
	const target = job.source === 'sidecar' ? job.absSidecarPath! : job.absVideoPath;
	const info = await stat(target);
	return createHash('sha256')
		.update(
			[target, info.size, Math.round(info.mtimeMs), job.source, job.streamIndex ?? ''].join('|')
		)
		.digest('hex');
}

async function writeAtomic(finalPath: string, text: string): Promise<void> {
	const tmp = `${finalPath}.${process.pid}.tmp`;
	await writeFile(tmp, text, 'utf8');
	await rename(tmp, finalPath);
}

/**
 * Make one subtitle track available as WebVTT in the cache. srt/vtt sidecars
 * convert in-process (charset-normalized); ass/ssa sidecars and embedded
 * tracks run through ffmpeg, whose output is written progressively so a
 * viewer can start reading before a large container is fully demuxed.
 */
export async function ensureSubtitleVtt(
	job: SubtitleJob,
	opts: ExtractOptions
): Promise<SubtitleHandle> {
	if (job.source === 'embedded' && job.streamIndex === undefined) {
		throw new Error('embedded subtitle needs a stream index');
	}
	if (job.source === 'sidecar' && !job.absSidecarPath) {
		throw new Error('sidecar subtitle needs a path');
	}
	await mkdir(SUBTITLE_CACHE_DIR, { recursive: true });
	const key = await cacheKey(job);
	const finalPath = join(SUBTITLE_CACHE_DIR, `${key}.vtt`);
	if (await exists(finalPath)) {
		return { path: finalPath, complete: true, done: Promise.resolve(finalPath) };
	}
	const current = inflight.get(key);
	if (current) return current;

	let ffmpegInput: string;
	if (job.source === 'sidecar') {
		const format = extname(job.absSidecarPath!).slice(1).toLowerCase();
		const text = decodeSubtitleText(await readFile(job.absSidecarPath!));
		if (format === 'srt' || format === 'vtt') {
			await writeAtomic(finalPath, format === 'srt' ? srtToVtt(text) : normalizeVtt(text));
			return { path: finalPath, complete: true, done: Promise.resolve(finalPath) };
		}
		// ass/ssa: ffmpeg reads the charset-normalized copy, never the original.
		ffmpegInput = join(SUBTITLE_CACHE_DIR, `${key}.src.${format}`);
		await writeFile(ffmpegInput, text, 'utf8');
	} else {
		ffmpegInput = job.absVideoPath;
	}

	if (!opts.ffmpegBin) throw new Error('ffmpeg unavailable — cannot convert this subtitle');
	if (running >= MAX_CONCURRENT_EXTRACTIONS) throw new Error('device busy');

	const partPath = `${finalPath}.part`;
	const ffmpegBin = opts.ffmpegBin;
	const args = subtitleArgs({
		input: ffmpegInput,
		streamIndex: job.source === 'embedded' ? job.streamIndex : undefined
	});
	running++;
	const done = new Promise<string>((resolveDone, rejectDone) => {
		opts.log(
			`extracting subtitle ${job.source === 'embedded' ? `#${job.streamIndex}` : 'sidecar'} from ${job.absVideoPath}`
		);
		const out = createWriteStream(partPath);
		const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let stderr = '';
		proc.stderr?.on('data', (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
		});
		proc.stdout?.pipe(out);
		const fail = async (message: string) => {
			out.destroy();
			await rm(partPath, { force: true }).catch(() => {});
			opts.log(`subtitle extraction failed (${job.absVideoPath}): ${message}`);
			rejectDone(new Error(message));
		};
		proc.on('error', (err) => void fail(err.message));
		proc.on('exit', (code, signal) => {
			if (code !== 0) {
				void fail(
					stderr.trim() ||
						(code === null
							? `ffmpeg killed by ${signal ?? 'signal'}`
							: `ffmpeg exited with code ${code}`)
				);
				return;
			}
			// stdout's 'end' flushes the write stream; wait for it before publishing.
			out.on('finish', () => {
				rename(partPath, finalPath).then(
					() => resolveDone(finalPath),
					(err: Error) => void fail(err.message)
				);
			});
			out.on('error', (err) => void fail(err.message));
			if (out.writableFinished) out.emit('finish');
		});
	}).finally(() => {
		running--;
		inflight.delete(key);
		if (job.source === 'sidecar') void rm(ffmpegInput, { force: true }).catch(() => {});
	});
	done.catch(() => {}); // observed by tailSubtitle / the caller
	const handle: SubtitleHandle = { path: partPath, complete: false, done };
	inflight.set(key, handle);
	return handle;
}

async function readFrom(path: string, position: number): Promise<Uint8Array | null> {
	let handle;
	try {
		handle = await open(path, 'r');
	} catch {
		return null; // not created yet, or renamed away
	}
	try {
		const buffer = Buffer.allocUnsafe(TAIL_READ_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, TAIL_READ_BYTES, position);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close().catch(() => {});
	}
}

/**
 * Yield a converting track's bytes as they land on disk, then the remainder
 * once ffmpeg finishes. Reads open/close per poll so the rename that
 * publishes the finished file works on Windows too. Throws when conversion
 * fails. Stopping the iterator leaves the extraction running (the cache
 * still fills for the next viewer).
 */
export async function* tailSubtitle(handle: SubtitleHandle): AsyncGenerator<Uint8Array> {
	let settled = false;
	let finalPath: string | null = null;
	let failure: Error | null = null;
	handle.done.then(
		(path) => {
			settled = true;
			finalPath = path;
		},
		(err: Error) => {
			settled = true;
			failure = err;
		}
	);
	let position = 0;
	for (;;) {
		const wasSettled = settled;
		const chunk = await readFrom(finalPath ?? handle.path, position);
		if (chunk && chunk.byteLength > 0) {
			position += chunk.byteLength;
			yield chunk;
			continue;
		}
		if (wasSettled) {
			if (failure) throw failure;
			return;
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, TAIL_POLL_MS));
	}
}
