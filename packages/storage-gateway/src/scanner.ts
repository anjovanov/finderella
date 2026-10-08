import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import {
	VIDEO_EXTENSIONS,
	type ProbedFile,
	type ScanStartMessage,
	type SubtitleSource
} from '@finderella/protocol';
import type { GatewayConnection } from './connection.js';
import { probeFile } from './probe.js';
import { ProbeCache, loadProbeCache, saveProbeCache } from './probe-cache.js';
import {
	SUBS_DIR_NAMES,
	isSubtitleFile,
	matchSidecars,
	type DirListing
} from './subtitles/sidecar.js';

const BATCH_SIZE = 25;
const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS);

interface VideoEntry {
	absPath: string;
	/** Library-relative listing of the video's folder (posix paths) for sidecar matching. */
	listing: DirListing;
}

function isVideoFile(name: string): boolean {
	return VIDEO_EXTENSION_SET.has(extname(name).toLowerCase());
}

/** Subtitle files in a `Subs/` folder and its immediate subfolders (`Subs/<video>/2_English.srt`). */
async function listSubsDir(dir: string): Promise<string[]> {
	const out: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const full = join(dir, entry.name);
		if (entry.isFile() && isSubtitleFile(entry.name)) out.push(full);
		else if (entry.isDirectory()) {
			let nested;
			try {
				nested = await readdir(full, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const child of nested) {
				if (child.isFile() && isSubtitleFile(child.name)) out.push(join(full, child.name));
			}
		}
	}
	return out;
}

/**
 * Walk a library root one directory at a time so every video sees its
 * folder's sidecar subtitles (same folder + `Subs/`). `Subs` folders are not
 * descended for videos. A folder that can't be read is reported through
 * `onDirError` and skipped; the rest of the walk carries on.
 */
async function* walkLibrary(
	root: string,
	onDirError: (dir: string, err: Error) => void,
	dir: string = root
): AsyncGenerator<VideoEntry> {
	const toRel = (abs: string) => relative(root, abs).split(sep).join('/');
	const videos: string[] = [];
	const subtitles: string[] = [];
	const subdirs: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (err) {
		onDirError(dir, err as Error);
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SUBS_DIR_NAMES.has(entry.name.toLowerCase()))
				subtitles.push(...(await listSubsDir(full)));
			else subdirs.push(full);
		} else if (entry.isFile()) {
			if (isVideoFile(entry.name)) videos.push(full);
			else if (isSubtitleFile(entry.name)) subtitles.push(full);
		}
	}
	const listing: DirListing = { videos: videos.map(toRel), subtitles: subtitles.map(toRel) };
	for (const absPath of videos) yield { absPath, listing };
	for (const sub of subdirs) yield* walkLibrary(root, onDirError, sub);
}

/**
 * Walk a library root, probe each video file (when ffprobe exists), and
 * report batches back to the hub. WS frames are ordered, so `scan.done`
 * always arrives after every `scan.file` batch.
 *
 * Unchanged files (same size and mtime as last scan) reuse the library's
 * probe cache instead of re-running ffprobe, unless the hub asked for `force`.
 * An aborted scan (the hub connection dropped) stops sending at once and
 * never sends `scan.done`: batches sent while offline are lost, so the hub
 * must not finalize it. A folder that couldn't be read makes the scan
 * `incomplete`, so the hub keeps the files it didn't hear about.
 */
export async function runScan(
	conn: GatewayConnection,
	msg: ScanStartMessage,
	opts: { ffprobe: boolean; log: (m: string) => void; signal: AbortSignal }
): Promise<void> {
	const { libraryId, rootPath, force } = msg;
	const { signal } = opts;
	opts.log(`scanning ${rootPath} (library ${libraryId})${force ? ', re-probing every file' : ''}`);
	let batch: ProbedFile[] = [];
	let files = 0;
	let probes = 0;
	let errors = 0;
	let incomplete = false;
	const cache = opts.ffprobe ? new ProbeCache(force ? {} : await loadProbeCache(rootPath)) : null;

	const flush = () => {
		if (batch.length === 0 || signal.aborted) return;
		conn.send({ type: 'scan.file', libraryId, files: batch });
		batch = [];
	};
	const onDirError = (dir: string, err: Error) => {
		errors++;
		incomplete = true;
		opts.log(`cannot read ${dir}: ${err.message}`);
	};

	for await (const { absPath, listing } of walkLibrary(rootPath, onDirError)) {
		if (signal.aborted) break;
		try {
			const relPath = relative(rootPath, absPath).split(sep).join('/');
			const info = await stat(absPath);
			// fs.stat reports fractional ms; the hub stores bigint.
			const mtimeMs = Math.round(info.mtimeMs);
			let probed = cache?.lookup(relPath, info.size, mtimeMs) ?? null;
			if (!probed) {
				probed = opts.ffprobe ? await probeFile(absPath) : {};
				probes++;
			}
			cache?.record(relPath, info.size, mtimeMs, probed);
			const subtitles: SubtitleSource[] = [
				...(probed.subtitles ?? []),
				...matchSidecars(relPath, listing)
			];
			batch.push({
				relPath,
				size: info.size,
				mtimeMs,
				container: extname(absPath).slice(1).toLowerCase(),
				...probed,
				// Always present so the hub can tell "no subtitles" from "old gateway".
				subtitles
			});
			files++;
			if (batch.length >= BATCH_SIZE) flush();
		} catch (err) {
			errors++;
			opts.log(`failed to scan ${absPath}: ${(err as Error).message}`);
		}
	}
	if (signal.aborted) {
		opts.log(`scan of ${rootPath} aborted (hub connection lost)`);
		return;
	}
	flush();
	conn.send({ type: 'scan.done', libraryId, stats: { files, errors }, incomplete });
	opts.log(
		`scan finished: ${files} files (${probes} probed), ${errors} errors${incomplete ? ', some folders unreadable' : ''}`
	);
	// Only a full walk knows every file that still exists.
	if (cache && !incomplete) {
		await saveProbeCache(rootPath, cache.entries()).catch((err: Error) =>
			opts.log(`failed to save probe cache: ${err.message}`)
		);
	}
}
