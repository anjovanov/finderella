import { describe, expect, it } from 'vitest';
import { genreLabel } from './genres';
import { GENRES } from './types';

describe('genreLabel', () => {
	it('labels every stored genre (English outside a request)', () => {
		for (const genre of GENRES) expect(genreLabel(genre)).toBe(genre);
	});

	it('passes unknown values through', () => {
		expect(genreLabel('Western')).toBe('Western');
	});
});
