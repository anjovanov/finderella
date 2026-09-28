import { describe, expect, it } from 'vitest';
import {
	normalizeAvatar,
	pickActiveProfile,
	profileColorCss,
	profileInitial,
	safeRedirectPath
} from './profiles';

describe('pickActiveProfile', () => {
	const a = { id: 'a' };
	const b = { id: 'b' };

	it('keeps the stored profile while the account still has it', () => {
		expect(pickActiveProfile([a, b], 'b')).toEqual({ profile: b, autoSelect: false });
	});

	it('auto-selects a lone profile when nothing (or something stale) is stored', () => {
		expect(pickActiveProfile([a], null)).toEqual({ profile: a, autoSelect: true });
		expect(pickActiveProfile([a], 'deleted')).toEqual({ profile: a, autoSelect: true });
	});

	it('asks when several profiles exist and none is stored', () => {
		expect(pickActiveProfile([a, b], undefined)).toEqual({ profile: null, autoSelect: false });
		expect(pickActiveProfile([a, b], 'other-account')).toEqual({
			profile: null,
			autoSelect: false
		});
	});

	it('returns nothing for an account without profiles', () => {
		expect(pickActiveProfile([], 'a')).toEqual({ profile: null, autoSelect: false });
	});
});

describe('normalizeAvatar', () => {
	it('keeps known values', () => {
		expect(normalizeAvatar({ color: 'violet', icon: 'rocket' })).toEqual({
			color: 'violet',
			icon: 'rocket'
		});
	});

	it('falls back to teal and the initial', () => {
		expect(normalizeAvatar({ color: 'plaid', icon: 'dragon' })).toEqual({
			color: 'teal',
			icon: null
		});
		expect(normalizeAvatar({})).toEqual({ color: 'teal', icon: null });
	});
});

describe('profileColorCss', () => {
	it('maps unknown colors to the first swatch', () => {
		expect(profileColorCss('nope')).toBe(profileColorCss('teal'));
	});
});

describe('profileInitial', () => {
	it('upper-cases the first character', () => {
		expect(profileInitial('  angel')).toBe('A');
		expect(profileInitial('élodie')).toBe('É');
	});

	it('keeps astral characters whole', () => {
		expect(profileInitial('🎬 Movies')).toBe('🎬');
	});

	it('returns ? for a blank name', () => {
		expect(profileInitial('   ')).toBe('?');
	});
});

describe('safeRedirectPath', () => {
	it('keeps same-origin paths', () => {
		expect(safeRedirectPath('/movies?genre=drama')).toBe('/movies?genre=drama');
	});

	it('rejects anything that could leave the site', () => {
		expect(safeRedirectPath('https://evil.test')).toBe('/');
		expect(safeRedirectPath('//evil.test')).toBe('/');
		expect(safeRedirectPath('/\\evil.test')).toBe('/');
		expect(safeRedirectPath(null)).toBe('/');
	});

	it('never loops back to the picker', () => {
		expect(safeRedirectPath('/profiles')).toBe('/');
		expect(safeRedirectPath('/profiles?redirectTo=/')).toBe('/');
	});
});
