import { describe, expect, it } from 'vitest';
import { formatClock, formatDurationShort } from './time';

describe('formatClock', () => {
	it('renders m:ss under an hour and h:mm:ss above', () => {
		expect(formatClock(0)).toBe('0:00');
		expect(formatClock(65)).toBe('1:05');
		expect(formatClock(3723.9)).toBe('1:02:03');
		expect(formatClock(36000)).toBe('10:00:00');
	});
});

describe('formatDurationShort', () => {
	it('rounds to minutes and drops zero parts', () => {
		expect(formatDurationShort(20)).toBe('<1m');
		expect(formatDurationShort(90)).toBe('2m');
		expect(formatDurationShort(3600)).toBe('1h');
		expect(formatDurationShort(8117)).toBe('2h 15m');
	});
});
