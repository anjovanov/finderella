import { describe, expect, it } from 'vitest';
import plural from './plural';

describe('plural', () => {
	it('picks the CLDR form for the count', () => {
		expect(plural(1, ['One file', '# files'])).toBe('One file');
		expect(plural(0, ['One file', '# files'])).toBe('0 files');
		expect(plural(2, ['# file', '# files'])).toBe('2 files');
	});

	it('groups digits for the language', () => {
		expect(plural(12345, ['# file', '# files'], 'en')).toBe('12,345 files');
		expect(plural(12345, ['# archivo', '# archivos'], 'es')).toBe('12.345 archivos');
	});

	it('uses Spanish rules (one / many / other)', () => {
		const forms = ['# archivo', '# de archivos', '# archivos'];
		expect(plural(1, forms, 'es')).toBe('1 archivo');
		expect(plural(1_000_000, forms, 'es')).toBe('1.000.000 de archivos');
		expect(plural(3, forms, 'es')).toBe('3 archivos');
	});

	it('falls back to the last candidate when a form is missing', () => {
		expect(plural(5, ['# file'], 'en')).toBe('5 file');
	});
});
