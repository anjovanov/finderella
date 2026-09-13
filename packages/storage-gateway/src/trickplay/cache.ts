import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TrickplayGeometry } from '@finderella/protocol';
import { cacheDir } from '../config.js';
import { sheetFileName } from './ffmpeg.js';

/**
 * Persistent sprite-sheet cache: one folder per file identity holding
 * `sheet-NNN.jpg` files and, once ffmpeg finished, `manifest.json`. The
 * manifest is the completion marker — a folder without one is a partial
 * run (crash, power loss) and gets wiped on the next request.
 */
export interface TrickplayManifest {
	version: 1;
	source: { absPath: string; size: number; mtimeMs: number };
	geometry: TrickplayGeometry;
	createdAt: string;
}

const MANIFEST = 'manifest.json';
const SHEET_RE = /^sheet-\d{3,}\.jpg$/;

export function trickplayRoot(): string {
	return join(cacheDir(), 'trickplay');
}

export function entryDir(key: string): string {
	return join(trickplayRoot(), key);
}

export function sheetPath(dir: string, n: number): string {
	return join(dir, sheetFileName(n));
}

export async function ensureEntryDir(dir: string): Promise<void> {
	await mkdir(dir, { recursive: true });
}

export async function readManifest(dir: string): Promise<TrickplayManifest | null> {
	try {
		const parsed = JSON.parse(await readFile(join(dir, MANIFEST), 'utf8')) as TrickplayManifest;
		return parsed && parsed.version === 1 && parsed.geometry ? parsed : null;
	} catch {
		return null;
	}
}

/** Temp + rename, so a reader never sees a half-written manifest. */
export async function writeManifest(dir: string, manifest: TrickplayManifest): Promise<void> {
	const finalPath = join(dir, MANIFEST);
	const tmp = `${finalPath}.${process.pid}.tmp`;
	await writeFile(tmp, JSON.stringify(manifest, null, '\t') + '\n', 'utf8');
	await rename(tmp, finalPath);
}

/**
 * A sheet is complete when it exists, is non-empty and ends with the JPEG
 * end-of-image marker — belt and braces over the muxer's atomic rename, for
 * ffmpeg builds that lack `-atomic_writing`.
 */
export async function sheetComplete(path: string): Promise<boolean> {
	let handle;
	try {
		handle = await open(path, 'r');
	} catch {
		return false;
	}
	try {
		const info = await handle.stat();
		if (info.size < 2) return false;
		const tail = Buffer.alloc(2);
		await handle.read(tail, 0, 2, info.size - 2);
		return tail[0] === 0xff && tail[1] === 0xd9;
	} catch {
		return false;
	} finally {
		await handle.close();
	}
}

/** Finished sheet files in the entry (the muxer's `.tmp` in-progress file doesn't match). */
export async function countSheets(dir: string): Promise<number> {
	try {
		const names = await readdir(dir);
		return names.filter((name) => SHEET_RE.test(name)).length;
	} catch {
		return 0;
	}
}

export async function entryExists(dir: string): Promise<boolean> {
	try {
		await stat(dir);
		return true;
	} catch {
		return false;
	}
}

export async function clearEntry(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true }).catch(() => {});
}
