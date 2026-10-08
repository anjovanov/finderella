import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProbedFile } from '@finderella/protocol';
import { z } from 'zod';
import { cacheDir } from './config.js';

/**
 * Bump when `probeFile`'s output changes (a new field, different parsing):
 * every cached probe is then discarded and the next scan re-probes everything.
 */
export const PROBE_CACHE_VERSION = 1;

/** What `probeFile` returns — the ffprobe-derived part of a `ProbedFile`. */
export const ProbeResult = ProbedFile.pick({
	videoCodec: true,
	audioCodec: true,
	width: true,
	height: true,
	durationMs: true,
	bitrate: true,
	subtitles: true,
	audioTracks: true,
	chapters: true
}).partial();
export type ProbeResult = z.infer<typeof ProbeResult>;

const CacheEntry = z.object({
	size: z.number(),
	mtimeMs: z.number(),
	probed: ProbeResult
});
type CacheEntry = z.infer<typeof CacheEntry>;

const CacheFile = z.object({
	version: z.literal(PROBE_CACHE_VERSION),
	entries: z.record(z.string(), CacheEntry)
});

export type ProbeEntries = Record<string, CacheEntry>;

/**
 * One scan's view of a library's probe cache: lookups hit the previous scan's
 * entries, and only files recorded during this scan survive the save, so
 * deleted or renamed files drop out by themselves.
 */
export class ProbeCache {
	readonly #previous: ProbeEntries;
	readonly #next: ProbeEntries = {};

	constructor(previous: ProbeEntries = {}) {
		this.#previous = previous;
	}

	/** The cached probe when the file still has the size and mtime it was probed at. */
	lookup(relPath: string, size: number, mtimeMs: number): ProbeResult | null {
		const entry = Object.hasOwn(this.#previous, relPath) ? this.#previous[relPath] : undefined;
		return entry && entry.size === size && entry.mtimeMs === mtimeMs ? entry.probed : null;
	}

	/** Remember a probe for the next scan; failed probes (`{}`) are never kept, so they retry. */
	record(relPath: string, size: number, mtimeMs: number, probed: ProbeResult): void {
		if (Object.keys(probed).length === 0) return;
		this.#next[relPath] = { size, mtimeMs, probed };
	}

	entries(): ProbeEntries {
		return this.#next;
	}
}

export function probeCacheRoot(): string {
	return join(cacheDir(), 'probe');
}

function cachePath(rootPath: string): string {
	const key = createHash('sha256').update(rootPath).digest('hex');
	return join(probeCacheRoot(), `${key}.json`);
}

/** The library's saved probes; a missing, unreadable or outdated file is an empty cache. */
export async function loadProbeCache(rootPath: string): Promise<ProbeEntries> {
	try {
		const parsed = CacheFile.safeParse(JSON.parse(await readFile(cachePath(rootPath), 'utf8')));
		return parsed.success ? parsed.data.entries : {};
	} catch {
		return {};
	}
}

/** Written temp + rename, so a crash mid-write leaves the previous cache intact. */
export async function saveProbeCache(rootPath: string, entries: ProbeEntries): Promise<void> {
	await mkdir(probeCacheRoot(), { recursive: true });
	const finalPath = cachePath(rootPath);
	const tmp = `${finalPath}.${process.pid}.tmp`;
	await writeFile(tmp, JSON.stringify({ version: PROBE_CACHE_VERSION, entries }), 'utf8');
	await rename(tmp, finalPath);
}
