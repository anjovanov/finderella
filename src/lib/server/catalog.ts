import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, movie, season, series } from '$lib/server/db/schema';
import {
	GENRES,
	type Episode,
	type Genre,
	type Maturity,
	type MediaItem,
	type Movie,
	type Season,
	type Series
} from '$lib/data/types';

/**
 * Catalog reads. Every function returns the exact shapes in
 * src/lib/data/types.ts (public `id` = DB slug), so pages and components are
 * agnostic about mock vs database data.
 */

type MovieRow = typeof movie.$inferSelect;
type SeriesRow = typeof series.$inferSelect;
type SeasonRow = typeof season.$inferSelect & { episodes: EpisodeRow[] };
type EpisodeRow = typeof episode.$inferSelect;

/** DB genres are free text; only the fixed tuple reaches the UI's filters. */
function knownGenres(names: string[]): Genre[] {
	return names.filter((g): g is Genre => (GENRES as readonly string[]).includes(g));
}

function rowToMovie(row: MovieRow): Movie {
	return {
		kind: 'movie',
		id: row.slug,
		title: row.title,
		tagline: row.tagline ?? undefined,
		synopsis: row.synopsis,
		year: row.year,
		runtimeMinutes: row.runtimeMinutes,
		director: row.director,
		budget: row.budget ?? undefined,
		rating: row.rating,
		maturity: row.maturity as Maturity,
		cast: row.castPeople ?? [],
		genres: knownGenres(row.genres),
		theme: { hue: row.hue, hue2: row.hue2 },
		posterUrl: row.posterUrl ?? undefined,
		backdropUrl: row.backdropUrl ?? undefined,
		trailerKey: row.trailerKey ?? undefined
	};
}

function rowToEpisode(row: EpisodeRow): Episode {
	return {
		id: row.slug,
		number: row.number,
		title: row.title,
		synopsis: row.synopsis,
		runtimeMinutes: row.runtimeMinutes,
		stillUrl: row.stillUrl ?? undefined
	};
}

function rowToSeries(row: SeriesRow & { seasons: SeasonRow[] }): Series {
	const seasons: Season[] = row.seasons
		.toSorted((a, b) => a.number - b.number)
		.map((s) => ({
			number: s.number,
			year: s.year,
			posterUrl: s.posterUrl ?? undefined,
			episodes: s.episodes.toSorted((a, b) => a.number - b.number).map(rowToEpisode)
		}));
	return {
		kind: 'series',
		id: row.slug,
		title: row.title,
		tagline: row.tagline ?? undefined,
		synopsis: row.synopsis,
		year: row.year,
		endYear: row.endYear ?? undefined,
		creator: row.creator,
		rating: row.rating,
		maturity: row.maturity as Maturity,
		cast: row.castPeople ?? [],
		genres: knownGenres(row.genres),
		theme: { hue: row.hue, hue2: row.hue2 },
		posterUrl: row.posterUrl ?? undefined,
		backdropUrl: row.backdropUrl ?? undefined,
		trailerKey: row.trailerKey ?? undefined,
		seasons
	};
}

const withSeasons = { seasons: { with: { episodes: true } } } as const;

export async function listMovies(): Promise<Movie[]> {
	const rows = await db.query.movie.findMany({ orderBy: [desc(movie.addedAt)] });
	return rows.map(rowToMovie);
}

export async function listSeries(): Promise<Series[]> {
	const rows = await db.query.series.findMany({
		with: withSeasons,
		orderBy: [desc(series.addedAt)]
	});
	return rows.map(rowToSeries);
}

/** All catalog items, most recently added first. */
export async function listAllItems(): Promise<MediaItem[]> {
	const [m, s] = await Promise.all([listMovies(), listSeries()]);
	// Interleave by recency is lost after mapping; refetch order cheaply by
	// merging on the original per-list order (both are addedAt desc already).
	return [...m, ...s];
}

export async function getMovieBySlug(slug: string): Promise<Movie | undefined> {
	const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	return row ? rowToMovie(row) : undefined;
}

export async function getSeriesBySlug(slug: string): Promise<Series | undefined> {
	const row = await db.query.series.findFirst({
		where: eq(series.slug, slug),
		with: withSeasons
	});
	return row ? rowToSeries(row) : undefined;
}

/** Hero pick for the home page: highest-rated item, else newest. */
export async function featured(): Promise<MediaItem | undefined> {
	const items = await listAllItems();
	if (items.length === 0) return undefined;
	return items.toSorted((a, b) => b.rating - a.rating)[0];
}

/** Most recently added items (DB insertion order, not release year). */
export async function recentlyAdded(limit = 12): Promise<MediaItem[]> {
	const [m, s] = await Promise.all([
		db.query.movie.findMany({ orderBy: [desc(movie.addedAt)], limit }),
		db.query.series.findMany({ with: withSeasons, orderBy: [desc(series.addedAt)], limit })
	]);
	const dated: { addedAt: Date; item: MediaItem }[] = [
		...m.map((row) => ({ addedAt: row.addedAt, item: rowToMovie(row) as MediaItem })),
		...s.map((row) => ({ addedAt: row.addedAt, item: rowToSeries(row) as MediaItem }))
	];
	return dated
		.toSorted((a, b) => b.addedAt.getTime() - a.addedAt.getTime())
		.slice(0, limit)
		.map((entry) => entry.item);
}
