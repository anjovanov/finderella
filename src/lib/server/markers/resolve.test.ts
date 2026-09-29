import { describe, expect, it } from 'vitest';
import { resolveMarkers, type MarkerRow } from './resolve';

const row = (r: Partial<MarkerRow> & Pick<MarkerRow, 'kind' | 'source'>): MarkerRow => ({
	startMs: 0,
	endMs: 0,
	confidence: 1,
	...r
});

describe('resolveMarkers', () => {
	it('prefers chapters over fingerprints over dark frames', () => {
		const markers = resolveMarkers(
			[
				row({ kind: 'intro', source: 'fingerprint', startMs: 60_000, endMs: 90_000 }),
				row({ kind: 'intro', source: 'chapter', startMs: 61_000, endMs: 92_000 })
			],
			1_300_000
		);
		expect(markers?.intro).toEqual({ start: 61, end: 92, autoSkip: true });
	});

	it('snaps credits near the end to the end of the file', () => {
		const markers = resolveMarkers(
			[
				row({
					kind: 'credits',
					source: 'fingerprint',
					startMs: 1_250_000,
					endMs: 1_290_000,
					confidence: 0.75
				})
			],
			1_300_000
		);
		expect(markers?.credits).toEqual({ start: 1250, end: 1300, autoSkip: true, toEnd: true });
	});

	it('keeps a post-credits scene reachable', () => {
		const markers = resolveMarkers(
			[
				row({
					kind: 'credits',
					source: 'darkframes',
					startMs: 1_250_000,
					endMs: 1_280_000,
					confidence: 0.5
				})
			],
			1_345_000
		);
		expect(markers?.credits).toEqual({ start: 1250, end: 1280, autoSkip: false, toEnd: false });
	});

	it('extends a fingerprint match with an adjoining dark-frame run', () => {
		const markers = resolveMarkers(
			[
				row({
					kind: 'credits',
					source: 'fingerprint',
					startMs: 2_600_000,
					endMs: 2_640_000,
					confidence: 1
				}),
				row({
					kind: 'credits',
					source: 'darkframes',
					startMs: 2_520_000,
					endMs: 2_700_000,
					confidence: 0.5
				})
			],
			2_700_000
		);
		expect(markers?.credits).toEqual({ start: 2520, end: 2700, autoSkip: true, toEnd: true });
	});

	it('keeps the precise fingerprint edge when dark frames disagree by a few seconds', () => {
		const markers = resolveMarkers(
			[
				row({
					kind: 'credits',
					source: 'fingerprint',
					startMs: 1_252_000,
					endMs: 1_283_000,
					confidence: 0.5
				}),
				row({
					kind: 'credits',
					source: 'darkframes',
					startMs: 1_246_000,
					endMs: 1_283_000,
					confidence: 0.5
				})
			],
			1_345_000
		);
		expect(markers?.credits).toMatchObject({ start: 1252, end: 1283, toEnd: false });
	});

	it('does not auto-skip weak fingerprint matches', () => {
		const markers = resolveMarkers(
			[row({ kind: 'intro', source: 'fingerprint', startMs: 0, endMs: 30_000, confidence: 0.25 })],
			1_300_000
		);
		expect(markers?.intro?.autoSkip).toBe(false);
	});

	it('drops tiny or invalid spans and returns null when nothing is left', () => {
		expect(
			resolveMarkers(
				[
					row({ kind: 'intro', source: 'chapter', startMs: 10_000, endMs: 12_000 }),
					row({ kind: 'credits', source: 'chapter', startMs: -5, endMs: 30_000 })
				],
				100_000
			)
		).toBeNull();
		expect(resolveMarkers([], 100_000)).toBeNull();
	});
});
