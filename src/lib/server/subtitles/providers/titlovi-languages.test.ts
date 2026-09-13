import { describe, expect, it } from 'vitest';
import { fromTitloviLang, titloviSupports, toTitloviLang } from './titlovi-languages';

describe('titlovi languages', () => {
	it('maps codes to display names and back, keeping the Cyrillic script', () => {
		expect(toTitloviLang('sr')).toBe('Srpski|Cirilica');
		expect(toTitloviLang('hr')).toBe('Hrvatski');
		expect(fromTitloviLang('Cirilica')).toEqual({ code: 'sr', script: 'cyrillic' });
		expect(fromTitloviLang('english')).toEqual({ code: 'en', script: undefined });
		expect(fromTitloviLang('Deutsch')).toBeNull();
		expect(titloviSupports('mk')).toBe(true);
		expect(titloviSupports('de')).toBe(false);
	});
});
