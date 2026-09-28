import { GENRES, type Genre } from './types';

/**
 * Browse categories (/categories): genres, TMDB collections and network /
 * studio brands. Client-safe and pure — the server gathers rows
 * (src/lib/server/categories.ts) and `groupCategories` turns them into tiles.
 */

/** Also the URL segment: /categories/<type>/<slug>. */
export const CATEGORY_TYPES = ['genres', 'collections', 'networks'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export function isCategoryType(value: string): value is CategoryType {
	return (CATEGORY_TYPES as readonly string[]).includes(value);
}

/** A collection needs this many movies in the library before it becomes a category. */
export const MIN_COLLECTION_PARTS = 2;
/** A network / studio needs this many titles before it becomes a category. */
export const MIN_STUDIO_TITLES = 2;

export interface CategoryTile {
	type: CategoryType;
	slug: string;
	name: string;
	/** Titles in the library under this category. */
	count: number;
	/** Backdrop artwork (genres, collections). */
	imageUrl?: string;
	/** Brand logo (networks); tiles fall back to the name. */
	logoUrl?: string;
}

export interface CategoryIndex {
	genres: CategoryTile[];
	collections: CategoryTile[];
	networks: CategoryTile[];
}

/** 'Sci-Fi' → 'sci-fi'. */
export function genreSlug(genre: Genre): string {
	return genre.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function genreFromSlug(slug: string): Genre | undefined {
	return GENRES.find((g) => genreSlug(g) === slug);
}

/** One movie or series, reduced to what grouping needs. */
export interface CategorySource {
	rating: number;
	backdropUrl: string | null;
	genres: Genre[];
	studios: string[];
	/** Movies only. */
	collectionId: number | null;
}

export interface StudioInfo {
	slug: string;
	name: string;
	logoUrl: string | null;
}

export interface CollectionInfo {
	tmdbId: number;
	slug: string;
	name: string;
	backdropUrl: string | null;
}

const byRating = (a: CategorySource, b: CategorySource) => b.rating - a.rating;

/** Highest-rated backdrop not already taken, else the highest-rated one at all. */
function pickArtwork(members: CategorySource[], used: Set<string>): string | undefined {
	const withArt = members.filter((m) => m.backdropUrl).toSorted(byRating);
	const pick = withArt.find((m) => !used.has(m.backdropUrl!)) ?? withArt[0];
	if (!pick) return undefined;
	used.add(pick.backdropUrl!);
	return pick.backdropUrl!;
}

export function groupCategories(
	titles: CategorySource[],
	studios: StudioInfo[],
	collections: CollectionInfo[]
): CategoryIndex {
	const byGenre = new Map<Genre, CategorySource[]>();
	const byStudio = new Map<string, CategorySource[]>();
	const byCollection = new Map<number, CategorySource[]>();
	for (const title of titles) {
		for (const g of new Set(title.genres)) byGenre.set(g, [...(byGenre.get(g) ?? []), title]);
		for (const s of new Set(title.studios)) byStudio.set(s, [...(byStudio.get(s) ?? []), title]);
		if (title.collectionId !== null) {
			byCollection.set(title.collectionId, [
				...(byCollection.get(title.collectionId) ?? []),
				title
			]);
		}
	}

	// Smallest genres pick artwork first (they have the fewest candidates), so
	// the big ones don't take every good backdrop; tiles then show A–Z.
	const used = new Set<string>();
	const genreArt = new Map<Genre, string | undefined>();
	for (const [genre, members] of [...byGenre].toSorted((a, b) => a[1].length - b[1].length)) {
		genreArt.set(genre, pickArtwork(members, used));
	}
	const genres: CategoryTile[] = [...byGenre]
		.map(([genre, members]) => ({
			type: 'genres' as const,
			slug: genreSlug(genre),
			name: genre,
			count: members.length,
			imageUrl: genreArt.get(genre)
		}))
		.toSorted((a, b) => a.name.localeCompare(b.name));

	const collectionTiles: CategoryTile[] = collections
		.flatMap((c) => {
			const members = byCollection.get(c.tmdbId) ?? [];
			if (members.length < MIN_COLLECTION_PARTS) return [];
			return [
				{
					type: 'collections' as const,
					slug: c.slug,
					name: c.name,
					count: members.length,
					imageUrl: c.backdropUrl ?? pickArtwork(members, new Set())
				}
			];
		})
		.toSorted((a, b) => a.name.localeCompare(b.name));

	const networks: CategoryTile[] = studios
		.flatMap((s) => {
			const members = byStudio.get(s.slug) ?? [];
			if (members.length < MIN_STUDIO_TITLES) return [];
			return [
				{
					type: 'networks' as const,
					slug: s.slug,
					name: s.name,
					count: members.length,
					logoUrl: s.logoUrl ?? undefined
				}
			];
		})
		.toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));

	return { genres, collections: collectionTiles, networks };
}
