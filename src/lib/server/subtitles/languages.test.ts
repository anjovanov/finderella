import { describe, expect, it } from 'vitest';
import { fromOpenSubtitles, fromSubdl, toGestdown, toOpenSubtitles, toSubdl } from './languages';

describe('provider language codes', () => {
	it('expands regional variants for OpenSubtitles and maps them back', () => {
		expect(toOpenSubtitles('en')).toEqual(['en']);
		expect(toOpenSubtitles('pt')).toEqual(['pt-br', 'pt-pt']);
		expect(fromOpenSubtitles('pt-BR')).toBe('pt');
		expect(fromOpenSubtitles('ea')).toBe('es');
		expect(fromOpenSubtitles('en')).toBe('en');
		expect(fromOpenSubtitles(null)).toBeUndefined();
	});

	it('sends Gestdown both regional variants where they differ', () => {
		expect(toGestdown('en')).toEqual(['en']);
		expect(toGestdown('pt')).toEqual(['pt-BR', 'pt']);
	});

	it('uses Subdl spellings and maps them back', () => {
		expect(toSubdl('en')).toEqual(['EN']);
		expect(toSubdl('pt')).toEqual(['PT', 'BR_PT']);
		expect(toSubdl('zh')).toEqual(['ZH', 'ZH_BG']);
		expect(fromSubdl('BR_PT')).toBe('pt');
		expect(fromSubdl('en')).toBe('en');
		expect(fromSubdl('ZH_BG')).toBe('zh');
		expect(fromSubdl('nope')).toBeUndefined();
	});
});
