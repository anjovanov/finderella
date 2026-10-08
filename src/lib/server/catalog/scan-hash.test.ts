import { describe, expect, it } from 'vitest';
import type { ProbedFile } from '@finderella/protocol';
import { scanHash, stableStringify } from './scan-hash';

const file: ProbedFile = {
	relPath: 'Movies/Heat (1995)/Heat.mkv',
	size: 1000,
	mtimeMs: 1700000000000,
	container: 'mkv',
	videoCodec: 'h264',
	durationMs: 6_000_000,
	subtitles: [
		{
			source: 'sidecar',
			relPath: 'Movies/Heat (1995)/Heat.en.srt',
			format: 'srt',
			forced: false,
			hearingImpaired: false
		}
	]
};

describe('stableStringify', () => {
	it('sorts keys at every depth and drops undefined', () => {
		expect(stableStringify({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } })).toBe(
			'{"a":{"d":[2,{"y":2,"z":1}]},"b":1}'
		);
	});
});

describe('scanHash', () => {
	it('ignores property order', () => {
		const reordered = Object.fromEntries(Object.entries(file).reverse()) as ProbedFile;
		expect(scanHash(reordered)).toBe(scanHash(file));
	});

	it('changes when anything reported changes', () => {
		const base = scanHash(file);
		expect(scanHash({ ...file, mtimeMs: file.mtimeMs + 1 })).not.toBe(base);
		expect(scanHash({ ...file, subtitles: [] })).not.toBe(base);
		expect(scanHash({ ...file, audioTracks: [] })).not.toBe(base);
	});
});
