import { describe, expect, it } from 'vitest';
import { formatDurationUnits, formatRelative, formatWatchTime } from './time';

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

describe('formatWatchTime', () => {
	it('rounds to minutes and keeps days as hours', () => {
		expect(formatWatchTime(0)).toBe('0m');
		expect(formatWatchTime(29)).toBe('0m');
		expect(formatWatchTime(45 * 60)).toBe('45m');
		expect(formatWatchTime(3600)).toBe('1h');
		expect(formatWatchTime(3600 + 5 * 60)).toBe('1h 5m');
		expect(formatWatchTime(50 * 3600)).toBe('50h');
	});
});

describe('formatRelative', () => {
	const now = Date.UTC(2026, 8, 24, 12, 0, 0);
	const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

	it('reads "just now" under a minute', () => {
		expect(formatRelative(ago(10), now, 'en')).toBe('just now');
	});

	it('picks the largest fitting unit', () => {
		expect(formatRelative(ago(5 * 60), now, 'en')).toBe('5 minutes ago');
		expect(formatRelative(ago(3 * 3600), now, 'en')).toBe('3 hours ago');
		expect(formatRelative(ago(86_400), now, 'en')).toBe('yesterday');
		expect(formatRelative(ago(14 * 86_400), now, 'en')).toBe('2 weeks ago');
		expect(formatRelative(ago(400 * 86_400), now, 'en')).toBe('last year');
	});
});
