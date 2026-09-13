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

async function readDirEntries(dir: string) {
	try {
		return await readdir(dir, { withFileTypes: true });
	} catch (err) {
		throw new Error(`cannot read ${dir}: ${(err as Error).message}`, { cause: err });
	}
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
 * descended for videos.
 */
async function* walkLibrary(root: string, dir: string = root): AsyncGenerator<VideoEntry> {
	const toRel = (abs: string) => relative(root, abs).split(sep).join('/');
	const videos: string[] = [];
	const subtitles: string[] = [];
	const subdirs: string[] = [];
	for (const entry of await readDirEntries(dir)) {
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
	for (const sub of subdirs) yield* walkLibrary(root, sub);
}

/**
 * Walk a library root, probe each video file (when ffprobe exists), and
 * report batches back to the hub. WS frames are ordered, so `scan.done`
 * always arrives after every `scan.file` batch.
 */
export async function runScan(
	conn: GatewayConnection,
	msg: ScanStartMessage,
	opts: { ffprobe: boolean; log: (m: string) => void }
): Promise<void> {
	const { libraryId, rootPath } = msg;
	opts.log(`scanning ${rootPath} (library ${libraryId})`);
	let batch: ProbedFile[] = [];
	let files = 0;
	let errors = 0;

	const flush = () => {
		if (batch.length === 0) return;
		conn.send({ type: 'scan.file', libraryId, files: batch });
		batch = [];
	};

	try {
		for await (const { absPath, listing } of walkLibrary(rootPath)) {
			try {
				const relPath = relative(rootPath, absPath).split(sep).join('/');
				const info = await stat(absPath);
				const probed = opts.ffprobe ? await probeFile(absPath) : {};
				const subtitles: SubtitleSource[] = [
					...(probed.subtitles ?? []),
					...matchSidecars(relPath, listing)
				];
				batch.push({
					relPath,
					size: info.size,
					// fs.stat reports fractional ms; the hub stores bigint.
					mtimeMs: Math.round(info.mtimeMs),
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
	} catch (err) {
		errors++;
		opts.log(`scan aborted: ${(err as Error).message}`);
	}
	flush();
	conn.send({ type: 'scan.done', libraryId, stats: { files, errors } });
	opts.log(`scan finished: ${files} files, ${errors} errors`);
}
