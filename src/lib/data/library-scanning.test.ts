import { describe, expect, it } from 'vitest';
import { isScanIntervalHours, scanDue, scanIntervalLabel } from './library-scanning';

const now = new Date('2026-10-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe('scanDue', () => {
	it('is never due without an interval', () => {
		expect(scanDue(null, null, now)).toBe(false);
		expect(scanDue(hoursAgo(100), null, now)).toBe(false);
	});

	it('is due for a never-scanned library', () => {
		expect(scanDue(null, 24, now)).toBe(true);
	});

	it('compares the last scan with the interval', () => {
		expect(scanDue(hoursAgo(23.9), 24, now)).toBe(false);
		expect(scanDue(hoursAgo(24), 24, now)).toBe(true);
		expect(scanDue(hoursAgo(2), 1, now)).toBe(true);
	});
});

describe('isScanIntervalHours', () => {
	it('accepts only the offered intervals', () => {
		expect(isScanIntervalHours(6)).toBe(true);
		expect(isScanIntervalHours(5)).toBe(false);
		expect(isScanIntervalHours('6')).toBe(false);
	});
});

describe('scanIntervalLabel', () => {
	it('names the intervals', () => {
		expect(scanIntervalLabel(null)).toBe('Off');
		expect(scanIntervalLabel(1)).toBe('Every hour');
		expect(scanIntervalLabel(6)).toBe('Every 6 hours');
		expect(scanIntervalLabel(24)).toBe('Every day');
	});
});
