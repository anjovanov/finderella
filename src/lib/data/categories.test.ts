import { describe, expect, it } from 'vitest';
import {
	genreFromSlug,
	genreSlug,
	groupCategories,
	isCategoryType,
	type CategorySource
} from './categories';

const title = (over: Partial<CategorySource> = {}): CategorySource => ({
	rating: 5,
	backdropUrl: null,
	genres: [],
	studios: [],
	collectionId: null,
	...over
});

describe('genre slugs', () => {
	it('round-trips every genre, including Sci-Fi', () => {
		expect(genreSlug('Sci-Fi')).toBe('sci-fi');
		expect(genreFromSlug('sci-fi')).toBe('Sci-Fi');
		expect(genreFromSlug('drama')).toBe('Drama');
		expect(genreFromSlug('western')).toBeUndefined();
	});

	it('knows the category URL segments', () => {
		expect(isCategoryType('networks')).toBe(true);
		expect(isCategoryType('studios')).toBe(false);
	});
});

describe('groupCategories', () => {
	it('lists genres A–Z with counts', () => {
		const { genres } = groupCategories(
			[title({ genres: ['Drama', 'Action'] }), title({ genres: ['Drama'] })],
			[],
			[]
		);
		expect(genres.map((g) => [g.name, g.slug, g.count])).toEqual([
			['Action', 'action', 1],
			['Drama', 'drama', 2]
		]);
	});

	it('gives genres distinct artwork when there is enough to go round', () => {
		const { genres } = groupCategories(
			[
				title({ genres: ['Drama', 'Action'], rating: 9, backdropUrl: 'a' }),
				title({ genres: ['Drama'], rating: 7, backdropUrl: 'b' })
			],
			[],
			[]
		);
		// Action (smaller) picks first and takes 'a'; Drama falls back to 'b'.
		expect(genres.find((g) => g.name === 'Action')?.imageUrl).toBe('a');
		expect(genres.find((g) => g.name === 'Drama')?.imageUrl).toBe('b');
	});

	it('reuses artwork rather than leaving a tile blank', () => {
		const { genres } = groupCategories(
			[title({ genres: ['Drama', 'Action'], backdropUrl: 'a' })],
			[],
			[]
		);
		expect(genres.map((g) => g.imageUrl)).toEqual(['a', 'a']);
	});

	it('needs two owned parts for a collection', () => {
		const collections = [
			{
				tmdbId: 1,
				slug: 'harry-potter-collection',
				name: 'Harry Potter Collection',
				backdropUrl: 'hp'
			},
			{ tmdbId: 2, slug: 'alien-collection', name: 'Alien Collection', backdropUrl: null }
		];
		const result = groupCategories(
			[
				title({ collectionId: 1 }),
				title({ collectionId: 1 }),
				title({ collectionId: 2, backdropUrl: 'x' })
			],
			[],
			collections
		);
		expect(result.collections).toEqual([
			{
				type: 'collections',
				slug: 'harry-potter-collection',
				name: 'Harry Potter Collection',
				count: 2,
				imageUrl: 'hp'
			}
		]);
	});

	it('falls back to a member backdrop for collections without artwork', () => {
		const result = groupCategories(
			[
				title({ collectionId: 2, rating: 6, backdropUrl: 'low' }),
				title({ collectionId: 2, rating: 8, backdropUrl: 'high' })
			],
			[],
			[{ tmdbId: 2, slug: 'alien', name: 'Alien', backdropUrl: null }]
		);
		expect(result.collections[0].imageUrl).toBe('high');
	});

	it('keeps networks with two or more titles, biggest first', () => {
		const studios = [
			{ slug: 'hbo', name: 'HBO', logoUrl: 'hbo.png' },
			{ slug: 'netflix', name: 'Netflix', logoUrl: null },
			{ slug: 'a24', name: 'A24', logoUrl: null }
		];
		const result = groupCategories(
			[
				title({ studios: ['netflix', 'hbo'] }),
				title({ studios: ['netflix'] }),
				title({ studios: ['netflix', 'a24'] }),
				title({ studios: ['hbo', 'hbo'] })
			],
			studios,
			[]
		);
		expect(result.networks.map((n) => [n.slug, n.count, n.logoUrl])).toEqual([
			['netflix', 3, undefined],
			['hbo', 2, 'hbo.png']
		]);
	});
});
