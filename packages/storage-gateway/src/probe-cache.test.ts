import { describe, expect, it } from 'vitest';
import { ProbeCache } from './probe-cache.js';

const probed = { videoCodec: 'h264', durationMs: 1_000, audioTracks: [], chapters: [] };

describe('ProbeCache', () => {
	it('hits only when size and mtime both match', () => {
		const cache = new ProbeCache({ 'a.mkv': { size: 10, mtimeMs: 5, probed } });
		expect(cache.lookup('a.mkv', 10, 5)).toEqual(probed);
		expect(cache.lookup('a.mkv', 11, 5)).toBeNull();
		expect(cache.lookup('a.mkv', 10, 6)).toBeNull();
		expect(cache.lookup('b.mkv', 10, 5)).toBeNull();
	});

	it('ignores inherited object keys', () => {
		const cache = new ProbeCache({});
		expect(cache.lookup('constructor', 0, 0)).toBeNull();
		expect(cache.lookup('__proto__', 0, 0)).toBeNull();
	});

	it('keeps only files recorded during this scan', () => {
		const cache = new ProbeCache({
			'kept.mkv': { size: 1, mtimeMs: 1, probed },
			'deleted.mkv': { size: 2, mtimeMs: 2, probed }
		});
		cache.record('kept.mkv', 1, 1, probed);
		cache.record('new.mkv', 3, 3, probed);
		expect(Object.keys(cache.entries()).sort()).toEqual(['kept.mkv', 'new.mkv']);
	});

	it('never keeps a failed probe, so it retries next scan', () => {
		const cache = new ProbeCache();
		cache.record('broken.mkv', 1, 1, {});
		expect(cache.entries()).toEqual({});
	});
});
