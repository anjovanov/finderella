import { describe, expect, it } from 'vitest';
import { hasRole, isAdmin, isRegistrationOpen, roleForNewUser } from './auth-roles';

describe('hasRole / isAdmin', () => {
	it('matches a role inside a comma-separated list', () => {
		expect(hasRole('admin,user', 'admin')).toBe(true);
		expect(hasRole('user, admin', 'admin')).toBe(true);
		expect(hasRole('user', 'admin')).toBe(false);
	});

	it('treats missing roles as no role', () => {
		expect(hasRole(null, 'admin')).toBe(false);
		expect(hasRole(undefined, 'admin')).toBe(false);
		expect(isAdmin(null)).toBe(false);
		expect(isAdmin({})).toBe(false);
	});

	it('does not match partial names', () => {
		expect(hasRole('administrator', 'admin')).toBe(false);
		expect(isAdmin({ role: ' admin ' })).toBe(true);
	});
});

describe('roleForNewUser', () => {
	it('makes the first user an admin regardless of the requested role', () => {
		expect(roleForNewUser(0)).toBe('admin');
		expect(roleForNewUser(0, 'user')).toBe('admin');
	});

	it('keeps the requested role, defaulting to user, once users exist', () => {
		expect(roleForNewUser(3)).toBe('user');
		expect(roleForNewUser(3, null)).toBe('user');
		expect(roleForNewUser(3, 'admin')).toBe('admin');
	});
});

describe('isRegistrationOpen', () => {
	it('is always open on an empty hub', () => {
		expect(isRegistrationOpen({ userCount: 0, allowRegistration: false })).toBe(true);
	});

	it('follows the setting once users exist', () => {
		expect(isRegistrationOpen({ userCount: 1, allowRegistration: false })).toBe(false);
		expect(isRegistrationOpen({ userCount: 1, allowRegistration: true })).toBe(true);
	});
});
