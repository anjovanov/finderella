import { arrayContains, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { collection, movie, series, studio } from '$lib/server/db/schema';
import { knownGenres, listMoviesWhere, listSeriesWhere } from '$lib/server/catalog';
import {
	MIN_COLLECTION_PARTS,
	MIN_STUDIO_TITLES,
	genreFromSlug,
	groupCategories,
	type CategoryIndex,
	type CategoryType
} from '$lib/data/categories';
import type { MediaItem } from '$lib/data/types';

/**
 * Browse categories. Genres come from `genres`, networks / studios from
 * `studios` (brand slugs → `studio`), collections from `movie.collection_id`
 * (→ `collection`); the last two are filled by TMDB enrichment.
 */

export async function categoryIndex(): Promise<CategoryIndex> {
	const columns = {
		rating: true,
		backdropUrl: true,
		genres: true,
		studios: true
	} as const;
	const [movies, shows, studios, collections] = await Promise.all([
		db.query.movie.findMany({ columns: { ...columns, collectionId: true } }),
		db.query.series.findMany({ columns }),
		db.select({ slug: studio.slug, name: studio.name, logoUrl: studio.logoUrl }).from(studio),
		db
			.select({
				tmdbId: collection.tmdbId,
				slug: collection.slug,
				name: collection.name,
				backdropUrl: collection.backdropUrl
			})
			.from(collection)
	]);
	const titles = [
		...movies.map((m) => ({ ...m, genres: knownGenres(m.genres) })),
		...shows.map((s) => ({ ...s, genres: knownGenres(s.genres), collectionId: null }))
	];
	return groupCategories(titles, studios, collections);
}

export interface CategoryDetail {
	type: CategoryType;
	slug: string;
	name: string;
	items: MediaItem[];
}

/** The titles of one category, or null when it doesn't exist (or is below its tile threshold). */
export async function categoryDetail(
	type: CategoryType,
	slug: string
): Promise<CategoryDetail | null> {
	if (type === 'genres') {
		const genre = genreFromSlug(slug);
		if (!genre) return null;
		const [movies, shows] = await Promise.all([
			listMoviesWhere(arrayContains(movie.genres, [genre])),
			listSeriesWhere(arrayContains(series.genres, [genre]))
		]);
		const items = [...movies, ...shows];
		return items.length > 0 ? { type, slug, name: genre, items } : null;
	}

	if (type === 'networks') {
		const row = await db.query.studio.findFirst({ where: eq(studio.slug, slug) });
		if (!row) return null;
		const [movies, shows] = await Promise.all([
			listMoviesWhere(arrayContains(movie.studios, [row.slug])),
			listSeriesWhere(arrayContains(series.studios, [row.slug]))
		]);
		const items = [...movies, ...shows];
		return items.length >= MIN_STUDIO_TITLES ? { type, slug, name: row.name, items } : null;
	}

	const row = await db.query.collection.findFirst({ where: eq(collection.slug, slug) });
	if (!row) return null;
	const items = await listMoviesWhere(eq(movie.collectionId, row.tmdbId));
	return items.length >= MIN_COLLECTION_PARTS ? { type, slug, name: row.name, items } : null;
}
