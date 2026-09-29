import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MarkersAnalysis } from '@finderella/protocol';
import { cacheDir } from '../config.js';

/**
 * Persistent analysis cache: one JSON file per (file identity, request).
 * Written temp + rename, so a reader never sees half a file; anything that
 * doesn't parse is treated as a miss and recomputed.
 */
export function markersRoot(): string {
	return join(cacheDir(), 'markers');
}

function entryPath(key: string): string {
	return join(markersRoot(), `${key}.json`);
}

export async function readAnalysis(key: string): Promise<MarkersAnalysis | null> {
	try {
		const parsed = MarkersAnalysis.safeParse(JSON.parse(await readFile(entryPath(key), 'utf8')));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export async function writeAnalysis(key: string, analysis: MarkersAnalysis): Promise<void> {
	await mkdir(markersRoot(), { recursive: true });
	const finalPath = entryPath(key);
	const tmp = `${finalPath}.${process.pid}.tmp`;
	await writeFile(tmp, JSON.stringify(analysis), 'utf8');
	await rename(tmp, finalPath);
}
