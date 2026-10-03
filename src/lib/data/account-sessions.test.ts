import { describe, expect, it } from 'vitest';
import { sessionDeviceLabel, sortAccountSessions, type AccountSession } from './account-sessions';

function s(id: string, lastActiveAt: string, current = false): AccountSession {
	return { id, browser: 'Chrome', os: 'Windows', deviceType: 'desktop', lastActiveAt, current };
}

describe('sessionDeviceLabel', () => {
	it('names browser and OS, filling in whichever is unknown', () => {
		expect(sessionDeviceLabel({ browser: 'Chrome', os: 'Windows' })).toBe('Chrome on Windows');
		expect(sessionDeviceLabel({ browser: 'Safari', os: 'iOS' })).toBe('Safari on iOS');
		expect(sessionDeviceLabel({ browser: null, os: 'Linux' })).toBe('Unknown browser on Linux');
		expect(sessionDeviceLabel({ browser: 'Firefox', os: null })).toBe('Firefox');
		expect(sessionDeviceLabel({ browser: null, os: null })).toBe('Unknown device');
	});
});

describe('sortAccountSessions', () => {
	it('puts the current session first, then the most recently used', () => {
		const list = [
			s('old', '2026-10-01T10:00:00Z'),
			s('here', '2026-09-01T10:00:00Z', true),
			s('new', '2026-10-03T10:00:00Z')
		];
		expect(sortAccountSessions(list).map((x) => x.id)).toEqual(['here', 'new', 'old']);
		// Doesn't reorder the caller's array.
		expect(list.map((x) => x.id)).toEqual(['old', 'here', 'new']);
	});
});
