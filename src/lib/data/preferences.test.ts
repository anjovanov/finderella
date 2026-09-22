import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, normalizePreferences, timeoutLabel } from './preferences';

describe('preferences', () => {
	it('keeps valid values', () => {
		expect(
			normalizePreferences({
				theme: 'light',
				screensaver: { enabled: true, kind: 'logo', seconds: 30 }
			})
		).toEqual({ theme: 'light', screensaver: { enabled: true, kind: 'logo', seconds: 30 } });
	});

	it('falls back to the defaults for unknown values', () => {
		expect(
			normalizePreferences({
				theme: 'sepia',
				screensaver: { enabled: 'yes', kind: 'clock', seconds: 45 }
			})
		).toEqual(DEFAULT_PREFERENCES);
		expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES);
	});

	it('labels the timeouts', () => {
		expect(timeoutLabel(30)).toBe('30 seconds');
		expect(timeoutLabel(60)).toBe('1 minute');
		expect(timeoutLabel(900)).toBe('15 minutes');
	});
});
