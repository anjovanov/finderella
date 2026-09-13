import { describe, expect, it } from 'vitest';
import { createSearchIndex, normalizeTerm, searchIndex, type SearchDoc } from './engine';

function doc(
	kind: SearchDoc['kind'],
	slug: string,
	title: string,
	year: number,
	extra: Partial<Pick<SearchDoc, 'people' | 'tagline' | 'synopsis' | 'genres'>> = {}
): SearchDoc {
	return {
		id: `${kind}:${slug}`,
		kind,
		slug,
		title,
		year,
		yearText: String(year),
		people: extra.people ?? '',
		tagline: extra.tagline ?? '',
		synopsis: extra.synopsis ?? '',
		genres: extra.genres ?? []
	};
}

const index = createSearchIndex([
	doc('movie', 'inception', 'Inception', 2010, {
		people: 'Christopher Nolan Leonardo DiCaprio Joseph Gordon-Levitt',
		synopsis: 'A thief who steals corporate secrets through dream-sharing technology.'
	}),
	doc('movie', 'inception-2', 'Inception 2', 2019, { synopsis: 'A hypothetical sequel.' }),
	doc('movie', 'interstellar', 'Interstellar', 2014, {
		people: 'Christopher Nolan Matthew McConaughey'
	}),
	doc('movie', 'the-dark-knight', 'The Dark Knight', 2008, { people: 'Christopher Nolan' }),
	doc('movie', 'source-code', 'Source Code', 2011, {
		synopsis: 'A soldier wakes up in a dark train and must find a bomber.'
	}),
	doc('movie', 'amelie', 'Amélie', 2001),
	doc('movie', 'fargo', 'Fargo', 1996),
	doc('series', 'fargo', 'Fargo', 2014),
	doc('series', 'dark', 'Dark', 2017, {
		synopsis: 'A missing child sets four families on a hunt for answers.'
	})
]);

const titles = (q: string, limit = 8) => searchIndex(index, q, limit).map((r) => r.title);

describe('normalizeTerm', () => {
	it('lowercases and strips diacritics', () => {
		expect(normalizeTerm('Amélie')).toBe('amelie');
		expect(normalizeTerm('Ünïcödé')).toBe('unicode');
	});
	it('drops empty leftovers', () => {
		expect(normalizeTerm('')).toBeNull();
	});
});

describe('searchIndex', () => {
	it('returns nothing for an empty query', () => {
		expect(searchIndex(index, '   ', 8)).toEqual([]);
	});

	it('finds accented titles from plain ascii', () => {
		expect(titles('amelie')).toEqual(['Amélie']);
	});

	it('tolerates typos in longer terms', () => {
		expect(titles('incepton')[0]).toBe('Inception');
		expect(titles('interstelar')[0]).toBe('Interstellar');
	});

	it('matches prefixes while typing', () => {
		expect(titles('inc')).toContain('Inception');
		expect(titles('inters')).toEqual(['Interstellar']);
	});

	it('ranks the exact title above titles that contain it', () => {
		expect(titles('inception')).toEqual(['Inception', 'Inception 2']);
	});

	it('treats years as exact tokens', () => {
		expect(titles('2010')).toEqual(['Inception']);
		expect(titles('inception 2010')[0]).toBe('Inception');
	});

	it('returns a movie and a series sharing a title, each with its kind', () => {
		const hits = searchIndex(index, 'fargo', 8);
		expect(hits.map((h) => [h.kind, h.id]).sort()).toEqual([
			['movie', 'fargo'],
			['series', 'fargo']
		]);
	});

	it('finds titles by cast and director', () => {
		expect(titles('dicaprio')).toEqual(['Inception']);
		expect(titles('nolan')).toEqual(
			expect.arrayContaining(['Inception', 'Interstellar', 'The Dark Knight'])
		);
	});

	it('ranks a title hit above a synopsis mention', () => {
		const hits = titles('dark');
		expect(hits[0]).toBe('Dark');
		expect(hits.indexOf('The Dark Knight')).toBeLessThan(hits.indexOf('Source Code'));
	});

	it('requires every word when possible, falling back to any word', () => {
		expect(titles('dark knight')[0]).toBe('The Dark Knight');
		expect(titles('knight zzzzzz')).toEqual(['The Dark Knight']);
		expect(titles('qqqqqq')).toEqual([]);
	});

	it('respects the limit', () => {
		expect(titles('nolan', 2)).toHaveLength(2);
	});

	it('exposes the stored fields the dropdown needs', () => {
		const [hit] = searchIndex(index, 'amelie', 1);
		expect(hit).toMatchObject({ kind: 'movie', id: 'amelie', title: 'Amélie', year: 2001 });
		expect(hit.posterUrl).toBeUndefined();
		expect(hit.score).toBeGreaterThan(0);
	});
});
