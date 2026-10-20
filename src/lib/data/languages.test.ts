import { describe, expect, it } from 'vitest';
import { languageLabel, languageOptions } from './languages';
import { currentLocale } from './locale';

describe('languageLabel', () => {
	it('names a known code (in the source language outside a compiled caller)', () => {
		expect(currentLocale()).toBe('en');
		expect(languageLabel('es')).toBe('Spanish');
		expect(languageLabel('de')).toBe('German');
	});

	it('is undefined for unknown codes', () => {
		expect(languageLabel('xx')).toBeUndefined();
		expect(languageLabel(null)).toBeUndefined();
	});

	it('lists every language once, sorted', () => {
		const options = languageOptions();
		const names = options.map((o) => o.name);
		expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b, 'en')));
		expect(new Set(options.map((o) => o.code)).size).toBe(options.length);
	});
});
