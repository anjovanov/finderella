/**
 * "More like this": ranks library titles by how much they share with one
 * title. Pure and client-safe; the server builds the profiles from DB rows
 * (`similarMovies` in src/lib/server/catalog.ts).
 */

export interface SimilarityProfile {
	/** Slug. */
	id: string;
	genres: string[];
	/** Empty/unset = unknown (never matches). */
	director?: string;
	/** Cast member names. */
	cast: string[];
	/** Studio brand slugs. */
	studios: string[];
	/** TMDB collection id; null = not part of one. */
	collectionId: number | null;
	rating: number;
	year: number;
}

export const SIMILAR_WEIGHTS = {
	genre: 3,
	collection: 6,
	director: 3,
	cast: 1,
	studio: 1
} as const;
/** Shared cast/studios stop adding beyond these (an ensemble shouldn't outweigh genre). */
export const SIMILAR_CAST_CAP = 3;
export const SIMILAR_STUDIO_CAP = 2;

function shared(a: string[], b: string[]): number {
	const set = new Set(a);
	return new Set(b.filter((x) => set.has(x))).size;
}

export function similarityScore(target: SimilarityProfile, other: SimilarityProfile): number {
	let score = shared(target.genres, other.genres) * SIMILAR_WEIGHTS.genre;
	if (target.collectionId !== null && target.collectionId === other.collectionId) {
		score += SIMILAR_WEIGHTS.collection;
	}
	if (target.director && target.director === other.director) score += SIMILAR_WEIGHTS.director;
	score += Math.min(shared(target.cast, other.cast), SIMILAR_CAST_CAP) * SIMILAR_WEIGHTS.cast;
	score +=
		Math.min(shared(target.studios, other.studios), SIMILAR_STUDIO_CAP) * SIMILAR_WEIGHTS.studio;
	return score;
}

/**
 * Slugs of the `limit` titles most like `target`, best first. Titles sharing
 * nothing are left out; ties go to the higher rating, then the closer year.
 */
export function rankSimilar(
	target: SimilarityProfile,
	candidates: SimilarityProfile[],
	limit = 20
): string[] {
	return candidates
		.filter((c) => c.id !== target.id)
		.map((c) => ({ c, score: similarityScore(target, c) }))
		.filter(({ score }) => score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.c.rating - a.c.rating ||
				Math.abs(a.c.year - target.year) - Math.abs(b.c.year - target.year)
		)
		.slice(0, limit)
		.map(({ c }) => c.id);
}
