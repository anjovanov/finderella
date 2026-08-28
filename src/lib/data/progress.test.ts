import { describe, expect, it } from 'vitest';
import { inProgress, progressFraction } from './progress';

describe('progressFraction', () => {
	it('hides the first seconds, shows the fraction, fills when finished', () => {
		expect(progressFraction(3, 1318)).toBeUndefined();
		expect(progressFraction(589, 1402)).toBeCloseTo(0.42, 2);
		expect(progressFraction(1300, 1318)).toBe(1);
		expect(progressFraction(20, 0)).toBeUndefined();
	});

	it('agrees with the resume threshold', () => {
		expect(inProgress(589, 1402)).toBe(true);
		expect(inProgress(1300, 1318)).toBe(false);
		expect(inProgress(3, 1318)).toBe(false);
	});
});
