import { describe, expect, it } from 'vitest';
import { formatDurationUnits } from './time';

describe('formatDurationUnits', () => {
	it('renders h/m/s parts and drops zero parts', () => {
		expect(formatDurationUnits(0)).toBe('0s');
		expect(formatDurationUnits(25)).toBe('25s');
		expect(formatDurationUnits(925)).toBe('15m 25s');
		expect(formatDurationUnits(900)).toBe('15m');
		expect(formatDurationUnits(3723.9)).toBe('1h 2m 3s');
		expect(formatDurationUnits(3600)).toBe('1h');
		expect(formatDurationUnits(3605)).toBe('1h 5s');
	});
});
