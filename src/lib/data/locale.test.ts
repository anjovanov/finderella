import { describe, expect, it } from 'vitest';
import { isLocale, LOCALES, localeName, pickLocale, resolveLocale, SOURCE_LOCALE } from './locale';

describe('pickLocale', () => {
	it('keeps a locale the app has a catalog for', () => {
		expect(pickLocale('es')).toBe('es');
		expect(pickLocale('en')).toBe('en');
	});

	it('falls back for anything else', () => {
		expect(pickLocale(null)).toBe(SOURCE_LOCALE);
		expect(pickLocale(undefined)).toBe(SOURCE_LOCALE);
		expect(pickLocale('')).toBe(SOURCE_LOCALE);
		expect(pickLocale('xx')).toBe(SOURCE_LOCALE);
		expect(pickLocale('ES')).toBe(SOURCE_LOCALE);
		expect(pickLocale(42)).toBe(SOURCE_LOCALE);
		expect(pickLocale('xx', 'es')).toBe('es');
	});
});

describe('resolveLocale', () => {
	it("prefers the profile's language", () => {
		expect(resolveLocale('es', 'en')).toBe('es');
		expect(resolveLocale('en', 'es')).toBe('en');
	});

	it("uses the hub's default when the profile follows it (null) or holds a dropped locale", () => {
		expect(resolveLocale(null, 'es')).toBe('es');
		expect(resolveLocale('fr', 'es')).toBe('es');
	});

	it('ends at the source language', () => {
		expect(resolveLocale(null, null)).toBe(SOURCE_LOCALE);
		expect(resolveLocale(null, 'fr')).toBe(SOURCE_LOCALE);
	});
});

describe('localeName', () => {
	it('names every locale in its own language', () => {
		for (const locale of LOCALES) expect(localeName(locale)).toBeTruthy();
		expect(localeName('es')).toBe('Español');
	});

	it('isLocale guards the list', () => {
		expect(isLocale('es')).toBe(true);
		expect(isLocale('de')).toBe(false);
	});
});
