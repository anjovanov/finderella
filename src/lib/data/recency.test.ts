import { describe, expect, it } from 'vitest';
import { isJustAdded, isoDay, newReleaseCutoff } from './recency';

describe('isJustAdded', () => {
	const now = Date.parse('2026-10-14T12:00:00Z');

	it('labels titles added within the last 14 days', () => {
		expect(isJustAdded('2026-10-14T11:00:00Z', now)).toBe(true);
		expect(isJustAdded('2026-10-01T12:00:01Z', now)).toBe(true);
	});

	it('drops the label after 14 days', () => {
		expect(isJustAdded('2026-09-30T12:00:00Z', now)).toBe(false);
	});

	it('is false without a usable date', () => {
		expect(isJustAdded(undefined, now)).toBe(false);
		expect(isJustAdded('not a date', now)).toBe(false);
	});
});

describe('newReleaseCutoff', () => {
	it('reaches back 12 months', () => {
		expect(newReleaseCutoff(new Date('2026-10-14T12:00:00Z'))).toBe('2025-10-14');
	});

	it('formats days as UTC calendar dates', () => {
		expect(isoDay(new Date('2026-01-05T23:30:00Z'))).toBe('2026-01-05');
	});
});
