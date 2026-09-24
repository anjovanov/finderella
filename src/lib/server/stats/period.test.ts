import { describe, expect, it } from 'vitest';
import { dayRange, fillDays, safeTimeZone, todayIn } from './period';

describe('safeTimeZone', () => {
	it('accepts IANA zones and falls back to UTC', () => {
		expect(safeTimeZone('Europe/Zagreb')).toBe('Europe/Zagreb');
		expect(safeTimeZone('Not/AZone')).toBe('UTC');
		expect(safeTimeZone("UTC'; drop table")).toBe('UTC');
		expect(safeTimeZone(undefined)).toBe('UTC');
	});
});

describe('todayIn', () => {
	it('uses the zone’s calendar date', () => {
		const lateUtc = new Date(Date.UTC(2026, 8, 24, 23, 30));
		expect(todayIn('UTC', lateUtc)).toBe('2026-09-24');
		expect(todayIn('Asia/Tokyo', lateUtc)).toBe('2026-09-25');
		expect(todayIn('America/New_York', lateUtc)).toBe('2026-09-24');
	});
});

describe('dayRange / fillDays', () => {
	it('lists the days oldest first, across month ends', () => {
		expect(dayRange('2026-03-02', 4)).toEqual([
			'2026-02-27',
			'2026-02-28',
			'2026-03-01',
			'2026-03-02'
		]);
	});

	it('zero-fills missing days', () => {
		const range = dayRange('2026-09-24', 3);
		const filled = fillDays([{ day: '2026-09-23', n: 4 }], range, (day) => ({ day, n: 0 }));
		expect(filled).toEqual([
			{ day: '2026-09-22', n: 0 },
			{ day: '2026-09-23', n: 4 },
			{ day: '2026-09-24', n: 0 }
		]);
	});
});
