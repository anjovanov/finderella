import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, mediaAudio, mediaFile, movie, season, series } from '$lib/server/db/schema';
import {
	GENRES,
	type Episode,
	type Genre,
	type Maturity,
	type MediaFormat,
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
export function knownGenres(names: string[]): Genre[] {
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

/** media_file columns the detail pages show (resolution badge + file-format tooltip). */
const fileFormatColumns = {
	id: mediaFile.id,
	container: mediaFile.container,
	size: mediaFile.size,
	bitrate: mediaFile.bitrate,
	videoCodec: mediaFile.videoCodec,
	audioCodec: mediaFile.audioCodec,
	width: mediaFile.width,
	height: mediaFile.height,
	durationMs: mediaFile.durationMs
};
type FileFormatRow = {
	id: string;
	container: string;
	size: number;
	bitrate: number | null;
	videoCodec: string | null;
	audioCodec: string | null;
	width: number | null;
	height: number | null;
};

/** "Best" file = tallest, then highest bitrate. `desc` would put NULLs first in Postgres. */
const bestFileOrder = [
	sql`${mediaFile.height} desc nulls last`,
	sql`${mediaFile.bitrate} desc nulls last`
];

/** The best active file of a movie (tallest, then highest bitrate). */
export async function bestMovieFile(movieId: string) {
	const [row] = await db
		.select(fileFormatColumns)
		.from(mediaFile)
		.where(and(eq(mediaFile.movieId, movieId), eq(mediaFile.status, 'active')))
		.orderBy(...bestFileOrder)
		.limit(1);
	return row;
}

/**
 * Technical details per file id, with every audio stream (one query for all
 * files). Files scanned by a gateway that predates audio-track discovery fall
 * back to the first stream's codec.
 */
async function fileFormats(files: FileFormatRow[]): Promise<Map<string, MediaFormat>> {
	const audioRows =
		files.length === 0
			? []
			: await db
					.select()
					.from(mediaAudio)
					.where(
						inArray(
							mediaAudio.mediaFileId,
							files.map((file) => file.id)
						)
					)
					.orderBy(asc(mediaAudio.streamIndex));
	const formats = new Map<string, MediaFormat>();
	for (const file of files) {
		const streams = audioRows.filter((row) => row.mediaFileId === file.id);
		formats.set(file.id, {
			container: file.container,
			sizeBytes: file.size,
			bitrate: file.bitrate,
			videoCodec: file.videoCodec,
			width: file.width,
			height: file.height,
			audio:
				streams.length > 0
					? streams.map((row) => ({
							codec: row.codec,
							language: row.language,
							title: row.title,
							channels: row.channels,
							isDefault: row.isDefault,
							commentary: row.commentary,
							descriptive: row.descriptive
						}))
					: file.audioCodec
						? [
								{
									codec: file.audioCodec,
									language: null,
									title: null,
									channels: null,
									isDefault: true,
									commentary: false,
									descriptive: false
								}
							]
						: []
		});
	}
	return formats;
}

/** Detail-page movie: `getMovieBySlug` plus the best file's resolution and format. */
export async function getMovieDetail(slug: string): Promise<Movie | undefined> {
	const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	if (!row) return undefined;
	const item = rowToMovie(row);
	const file = await bestMovieFile(row.id);
	if (file?.width && file.height) {
		item.sourceWidth = file.width;
		item.sourceHeight = file.height;
	}
	if (file) item.format = (await fileFormats([file])).get(file.id);
	return item;
}

export async function getMoviesBySlugs(slugs: string[]): Promise<Movie[]> {
	if (slugs.length === 0) return [];
	const rows = await db.query.movie.findMany({ where: inArray(movie.slug, slugs) });
	return rows.map(rowToMovie);
}

export async function getSeriesBySlugs(slugs: string[]): Promise<Series[]> {
	if (slugs.length === 0) return [];
	const rows = await db.query.series.findMany({
		where: inArray(series.slug, slugs),
		with: withSeasons
	});
	return rows.map(rowToSeries);
}

export async function getSeriesBySlug(slug: string): Promise<Series | undefined> {
	const row = await db.query.series.findFirst({
		where: eq(series.slug, slug),
		with: withSeasons
	});
	return row ? rowToSeries(row) : undefined;
}

/** Detail-page series: `getSeriesBySlug` plus each episode's best-file format. */
export async function getSeriesDetail(slug: string): Promise<Series | undefined> {
	const row = await db.query.series.findFirst({
		where: eq(series.slug, slug),
		with: withSeasons
	});
	if (!row) return undefined;
	const item = rowToSeries(row);
	const files = await db
		.select({ ...fileFormatColumns, episodeId: mediaFile.episodeId })
		.from(mediaFile)
		.innerJoin(episode, eq(episode.id, mediaFile.episodeId))
		.where(and(eq(episode.seriesId, row.id), eq(mediaFile.status, 'active')))
		.orderBy(...bestFileOrder);
	// Ordered best-first, so the first file seen per episode wins.
	const best = new Map<string, (typeof files)[number]>();
	for (const file of files) {
		if (file.episodeId && !best.has(file.episodeId)) best.set(file.episodeId, file);
	}
	const formats = await fileFormats([...best.values()]);
	// Frontend episodes are keyed by slug; files by the episode's row id.
	const rowIdBySlug = new Map(
		row.seasons.flatMap((s) => s.episodes.map((e) => [e.slug, e.id] as const))
	);
	for (const s of item.seasons) {
		for (const e of s.episodes) {
			const file = best.get(rowIdBySlug.get(e.id) ?? '');
			if (file) e.format = formats.get(file.id);
		}
	}
	return item;
}

export interface ScreensaverArtwork {
	title: string;
	year: number;
	backdropUrl: string;
}

/** Backdrops for the screensaver slideshow: titles that have one, in random order. */
export async function screensaverArtwork(limit = 40): Promise<ScreensaverArtwork[]> {
	const columns = { title: movie.title, year: movie.year, backdropUrl: movie.backdropUrl };
	const [movies, shows] = await Promise.all([
		db
			.select(columns)
			.from(movie)
			.where(isNotNull(movie.backdropUrl))
			.orderBy(sql`random()`)
			.limit(limit),
		db
			.select({ title: series.title, year: series.year, backdropUrl: series.backdropUrl })
			.from(series)
			.where(isNotNull(series.backdropUrl))
			.orderBy(sql`random()`)
			.limit(limit)
	]);
	return [...movies, ...shows]
		.filter((row): row is ScreensaverArtwork => !!row.backdropUrl)
		.toSorted(() => Math.random() - 0.5)
		.slice(0, limit);
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
