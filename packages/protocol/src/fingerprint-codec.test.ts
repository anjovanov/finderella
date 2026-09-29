import { describe, expect, it } from 'vitest';
import { decodeFingerprint, encodeFingerprint } from './fingerprint-codec.js';
import { MarkersAnalyzeMessage, MarkersAnalyzeResult } from './messages.js';

describe('fingerprint codec', () => {
	it('round-trips uint32 values including 0 and 0xffffffff', () => {
		const values = new Uint32Array([0, 1, 0xdeadbeef, 0xffffffff, 12345678]);
		expect(Array.from(decodeFingerprint(encodeFingerprint(values)))).toEqual(Array.from(values));
	});

	it('encodes little-endian', () => {
		expect(Buffer.from(encodeFingerprint(new Uint32Array([1])), 'base64')).toEqual(
			Buffer.from([1, 0, 0, 0])
		);
	});

	it('handles empty input', () => {
		expect(decodeFingerprint(encodeFingerprint(new Uint32Array(0)))).toHaveLength(0);
		expect(decodeFingerprint('')).toHaveLength(0);
	});

	it('ignores a trailing partial value and garbage', () => {
		const partial = Buffer.from([1, 0, 0, 0, 9, 9]).toString('base64');
		expect(Array.from(decodeFingerprint(partial))).toEqual([1]);
		expect(() => decodeFingerprint('!!not base64!!')).not.toThrow();
	});
});

describe('markers messages', () => {
	it('defaults regions to an empty list', () => {
		const parsed = MarkersAnalyzeMessage.parse({
			id: 1,
			type: 'markers.analyze',
			rootPath: '/media',
			relPath: 'a.mkv'
		});
		expect(parsed.regions).toEqual([]);
	});

	it('rejects oversized regions and out-of-range pblack', () => {
		expect(
			MarkersAnalyzeMessage.safeParse({
				id: 1,
				type: 'markers.analyze',
				rootPath: '/media',
				relPath: 'a.mkv',
				regions: [{ kind: 'intro', startMs: 0, durationMs: 60 * 60_000 }]
			}).success
		).toBe(false);
		expect(
			MarkersAnalyzeResult.safeParse({
				status: 'ready',
				analysis: {
					version: 1,
					hopMs: 92.9,
					regions: [],
					darkframes: { timesMs: [0], pblack: [101] }
				}
			}).success
		).toBe(false);
	});
});
