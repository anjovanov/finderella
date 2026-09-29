import { describe, expect, it } from 'vitest';
import { analysisSpec, pickAnalysisAudio } from './regions';

const MIN = 60_000;

describe('analysisSpec', () => {
	it('fingerprints the opening and ending of an episode', () => {
		expect(analysisSpec('series', 44 * MIN)).toEqual({
			regions: [
				{ kind: 'intro', startMs: 0, durationMs: 10 * MIN },
				{ kind: 'credits', startMs: 38 * MIN, durationMs: 6 * MIN }
			],
			darkframes: { startMs: 38 * MIN, durationMs: 6 * MIN }
		});
	});

	it('scales the windows down for short episodes', () => {
		const spec = analysisSpec('series', 20 * MIN)!;
		expect(spec.regions[0].durationMs).toBe(6 * MIN);
		expect(spec.regions[1]).toEqual({ kind: 'credits', startMs: 15 * MIN, durationMs: 5 * MIN });
	});

	it('only samples dark frames for movies', () => {
		expect(analysisSpec('movie', 120 * MIN)).toEqual({
			regions: [],
			darkframes: { startMs: 105 * MIN, durationMs: 15 * MIN }
		});
	});

	it('skips clips', () => {
		expect(analysisSpec('series', 2 * MIN)).toBeNull();
		expect(analysisSpec('movie', Number.NaN)).toBeNull();
	});
});

describe('pickAnalysisAudio', () => {
	const track = (
		streamIndex: number,
		extra: Partial<Parameters<typeof pickAnalysisAudio>[0][number]> = {}
	) => ({
		streamIndex,
		isDefault: false,
		commentary: false,
		descriptive: false,
		...extra
	});

	it('prefers the default main track', () => {
		expect(pickAnalysisAudio([track(1), track(2, { isDefault: true })])).toBe(2);
		expect(pickAnalysisAudio([track(1, { isDefault: true, commentary: true }), track(2)])).toBe(2);
		expect(pickAnalysisAudio([track(3, { descriptive: true })])).toBe(3);
		expect(pickAnalysisAudio([])).toBeUndefined();
	});
});
