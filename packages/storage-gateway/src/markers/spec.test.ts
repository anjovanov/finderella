import { describe, expect, it } from 'vitest';
import { markersCacheKey, normalizeSpec } from './spec.js';

describe('normalizeSpec', () => {
	it('keeps a normal series request as is', () => {
		const spec = normalizeSpec({
			audioStreamIndex: 1,
			regions: [
				{ kind: 'intro', startMs: 0, durationMs: 600_000 },
				{ kind: 'credits', startMs: 2_000_000, durationMs: 360_000 }
			],
			darkframes: { startMs: 2_000_000, durationMs: 360_000 }
		});
		expect(spec.regions).toHaveLength(2);
		expect(spec.audioStreamIndex).toBe(1);
		expect(spec.darkframes).toEqual({ startMs: 2_000_000, durationMs: 360_000 });
	});

	it('caps the total audio budget at 20 minutes', () => {
		const spec = normalizeSpec({
			regions: [
				{ kind: 'intro', startMs: 0, durationMs: 15 * 60_000 },
				{ kind: 'credits', startMs: 0, durationMs: 15 * 60_000 }
			]
		});
		expect(spec.regions.map((r) => r.durationMs)).toEqual([15 * 60_000, 5 * 60_000]);
	});

	it('drops the stream index when no audio is analysed', () => {
		const spec = normalizeSpec({
			audioStreamIndex: 2,
			regions: [],
			darkframes: { startMs: 0, durationMs: 1000 }
		});
		expect(spec.audioStreamIndex).toBeUndefined();
	});
});

describe('markersCacheKey', () => {
	const spec = normalizeSpec({ regions: [{ kind: 'intro', startMs: 0, durationMs: 1000 }] });

	it('changes with file identity and request', () => {
		const key = markersCacheKey('/a.mkv', 10, 1000.4, spec);
		expect(markersCacheKey('/a.mkv', 10, 1000, spec)).toBe(key);
		expect(markersCacheKey('/a.mkv', 11, 1000, spec)).not.toBe(key);
		expect(
			markersCacheKey(
				'/a.mkv',
				10,
				1000,
				normalizeSpec({ regions: [], darkframes: { startMs: 0, durationMs: 1000 } })
			)
		).not.toBe(key);
	});
});
