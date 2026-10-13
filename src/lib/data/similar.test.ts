import { describe, expect, it } from 'vitest';
import { rankSimilar, similarityScore, type SimilarityProfile } from './similar';

function profile(id: string, over: Partial<SimilarityProfile> = {}): SimilarityProfile {
	return {
		id,
		genres: [],
		director: '',
		cast: [],
		studios: [],
		collectionId: null,
		rating: 7,
		year: 2020,
		...over
	};
}

const target = profile('target', {
	genres: ['Drama', 'Thriller'],
	director: 'Jane Doe',
	cast: ['A', 'B', 'C', 'D', 'E'],
	studios: ['a24', 'neon', 'hbo'],
	collectionId: 42
});

describe('similarityScore', () => {
	it('weighs genres, collection, director, cast and studios', () => {
		expect(similarityScore(target, profile('x', { genres: ['Drama'] }))).toBe(3);
		expect(similarityScore(target, profile('x', { collectionId: 42 }))).toBe(6);
		expect(similarityScore(target, profile('x', { director: 'Jane Doe' }))).toBe(3);
		expect(similarityScore(target, profile('x', { cast: ['A'] }))).toBe(1);
		expect(similarityScore(target, profile('x', { studios: ['a24'] }))).toBe(1);
	});

	it('caps shared cast and studios', () => {
		expect(similarityScore(target, profile('x', { cast: ['A', 'B', 'C', 'D', 'E'] }))).toBe(3);
		expect(similarityScore(target, profile('x', { studios: ['a24', 'neon', 'hbo'] }))).toBe(2);
	});

	it('never matches an unknown director or a missing collection', () => {
		const blank = profile('blank');
		expect(similarityScore(blank, profile('x'))).toBe(0);
	});
});

describe('rankSimilar', () => {
	it('excludes the target itself and titles sharing nothing', () => {
		const ids = rankSimilar(target, [
			target,
			profile('unrelated', { genres: ['Comedy'] }),
			profile('drama', { genres: ['Drama'] })
		]);
		expect(ids).toEqual(['drama']);
	});

	it('ranks a collection sibling above a genre-only match', () => {
		const ids = rankSimilar(target, [
			profile('genre', { genres: ['Drama'] }),
			profile('sequel', { collectionId: 42 })
		]);
		expect(ids).toEqual(['sequel', 'genre']);
	});

	it('breaks ties by rating, then by the closer year', () => {
		const ids = rankSimilar(target, [
			profile('far', { genres: ['Drama'], rating: 8, year: 1990 }),
			profile('near', { genres: ['Drama'], rating: 8, year: 2019 }),
			profile('best', { genres: ['Drama'], rating: 9, year: 1970 })
		]);
		expect(ids).toEqual(['best', 'near', 'far']);
	});

	it('returns at most `limit` titles', () => {
		const many = Array.from({ length: 10 }, (_, i) => profile(`m${i}`, { genres: ['Drama'] }));
		expect(rankSimilar(target, many, 4)).toHaveLength(4);
	});
});
