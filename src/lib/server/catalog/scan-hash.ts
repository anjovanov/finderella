import { createHash } from 'node:crypto';
import type { ProbedFile } from '@finderella/protocol';

/**
 * Bump when parse.ts or ingest's mapping of a scan report changes: every
 * file's next report then hashes differently and is ingested in full again.
 */
export const INGEST_VERSION = 1;

/** JSON with object keys sorted, so the hash doesn't depend on property order. */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/**
 * Fingerprint of everything a scan reported about a file (size, mtime, probe
 * results, sidecars). Equal hash + an active, linked row = nothing to ingest.
 */
export function scanHash(file: ProbedFile): string {
	return createHash('sha256')
		.update(`v${INGEST_VERSION}|${stableStringify(file)}`)
		.digest('hex');
}
