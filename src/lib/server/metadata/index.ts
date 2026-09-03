import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, movie, season, series } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import type { CastMember } from '$lib/data/types';
import {
	mapGenres,
	movieMaturity,
	pickBestMatch,
	pickTrailer,
	scanTitleFromSlug,
	tvMaturity,
	yearOf,
	type MatchCandidate
} from './map';
import {
	getMovie,
	getTv,
	getTvSeason,
	imageUrl,
	isTmdbConfigured,
	searchMovie,
	searchTv,
	type MovieDetails,
	type TvDetails
} from './tmdb';

/**
 * TMDB enrichment. Scans create titles from filenames only; this fills
 * synopsis / genres / cast / crew / ratings / artwork / episode titles from
 * TMDB and records the match (`tmdb_id`). `metadata_updated_at` is stamped
 * whether or not a match was found, so unmatched titles aren't re-searched on
 * every scan — only a forced refresh retries them. `slug` and the gradient
 * hues are never touched: the slug is the URL and the ingest key.
 */

export { isTmdbConfigured };

const CONCURRENCY = 2;
const CAST_LIMIT = 8;
const POSTER_SIZE = 'w500';
const BACKDROP_SIZE = 'w1280';
const PROFILE_SIZE = 'w185';
const STILL_SIZE = 'w780';

function castFrom(credits: MovieDetails['credits'] | TvDetails['credits']): CastMember[] {
	return (credits?.cast ?? [])
		.toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))
		.slice(0, CAST_LIMIT)
		.map((c) => {
			const member: CastMember = { name: c.name };
			if (c.character?.trim()) member.character = c.character.trim();
			const photo = imageUrl(c.profile_path, PROFILE_SIZE);
			if (photo) member.photoUrl = photo;
			return member;
		});
}

let running = false;
let queued: { force: boolean } | null = null;

/**
 * Search with the year first (it disambiguates remakes), then without: the
 * ingest year is only a guess (file mtime) when the filename carried none, and
 * TMDB's year filter then hides the real title entirely.
 */
async function findTmdbId<T>(
	search: (query: string, year?: number) => Promise<T[]>,
	toCandidate: (r: T) => MatchCandidate,
	title: string,
	year?: number
): Promise<number | null> {
	const pick = (results: T[]) => pickBestMatch(results.map(toCandidate), title, year)?.id ?? null;
	if (year !== undefined) {
		const withYear = pick(await search(title, year));
		if (withYear !== null) return withYear;
	}
	return pick(await search(title));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

async function workPool(tasks: (() => Promise<void>)[]): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < tasks.length) {
			const task = tasks[next++];
			await task().catch((err) => log.error({ err }, 'metadata task failed'));
		}
	};
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
}

// ---------- movies ----------

function movieUpdate(details: MovieDetails, current: typeof movie.$inferSelect) {
	const values: Partial<typeof movie.$inferInsert> = {
		tmdbId: details.id,
		metadataUpdatedAt: new Date(),
		synopsis: details.overview ?? current.synopsis,
		tagline: details.tagline?.trim() || null,
		genres: mapGenres((details.genres ?? []).map((g) => g.name)),
		castPeople: castFrom(details.credits),
		posterUrl: imageUrl(details.poster_path, POSTER_SIZE),
		backdropUrl: imageUrl(details.backdrop_path, BACKDROP_SIZE),
		trailerKey: pickTrailer(details.videos?.results)?.key ?? null,
		// TMDB reports 0 for "unknown".
		budget: details.budget && details.budget > 0 ? details.budget : null
	};
	if (details.title?.trim()) values.title = details.title.trim();
	const year = yearOf(details.release_date);
	if (year) values.year = year;
	if (typeof details.vote_average === 'number') values.rating = round1(details.vote_average);
	if (current.runtimeMinutes === 0 && details.runtime) values.runtimeMinutes = details.runtime;
	const director = (details.credits?.crew ?? []).filter((c) => c.job === 'Director');
	if (director.length > 0) values.director = director.map((c) => c.name).join(', ');
	const maturity = movieMaturity(details.release_dates);
	if (maturity) values.maturity = maturity;
	return values;
}

export async function enrichMovie(movieId: string, opts: { force?: boolean } = {}): Promise<void> {
	const row = await db.query.movie.findFirst({ where: eq(movie.id, movieId) });
	if (!row || (!opts.force && row.metadataUpdatedAt)) return;

	// A forced refresh re-matches from scratch so a wrong match can be corrected.
	let tmdbId = opts.force ? null : row.tmdbId;
	if (!tmdbId) {
		tmdbId = await findTmdbId(
			searchMovie,
			(r) => ({
				id: r.id,
				titles: [r.title, r.original_title],
				year: yearOf(r.release_date),
				popularity: r.popularity
			}),
			opts.force ? scanTitleFromSlug(row.slug, 'movie') : row.title,
			row.year
		);
	}
	const details = tmdbId ? await getMovie(tmdbId) : null;
	if (!details) {
		await db
			.update(movie)
			.set({ metadataUpdatedAt: new Date(), tmdbId: tmdbId ?? null })
			.where(eq(movie.id, movieId));
		log.info({ slug: row.slug, title: row.title, year: row.year }, 'movie unmatched on tmdb');
		return;
	}
	await db.update(movie).set(movieUpdate(details, row)).where(eq(movie.id, movieId));
	log.info({ slug: row.slug, tmdbId: details.id }, 'movie metadata enriched');
}

// ---------- series ----------

function seriesUpdate(details: TvDetails, current: typeof series.$inferSelect) {
	const values: Partial<typeof series.$inferInsert> = {
		tmdbId: details.id,
		metadataUpdatedAt: new Date(),
		synopsis: details.overview ?? current.synopsis,
		tagline: details.tagline?.trim() || null,
		genres: mapGenres((details.genres ?? []).map((g) => g.name)),
		castPeople: castFrom(details.credits),
		posterUrl: imageUrl(details.poster_path, POSTER_SIZE),
		backdropUrl: imageUrl(details.backdrop_path, BACKDROP_SIZE),
		trailerKey: pickTrailer(details.videos?.results)?.key ?? null,
		creator: (details.created_by ?? []).map((c) => c.name).join(', ') || current.creator
	};
	if (details.name?.trim()) values.title = details.name.trim();
	const year = yearOf(details.first_air_date);
	if (year) values.year = year;
	const ended = details.status === 'Ended' || details.status === 'Canceled';
	values.endYear = ended ? (yearOf(details.last_air_date) ?? null) : null;
	if (typeof details.vote_average === 'number') values.rating = round1(details.vote_average);
	const maturity = tvMaturity(details.content_ratings);
	if (maturity) values.maturity = maturity;
	return values;
}

async function enrichSeasons(
	seriesId: string,
	tmdbId: number,
	seasonNumbers?: number[]
): Promise<void> {
	const seasons = await db.query.season.findMany({
		where: seasonNumbers
			? and(eq(season.seriesId, seriesId), inArray(season.number, seasonNumbers))
			: eq(season.seriesId, seriesId),
		with: { episodes: true }
	});
	for (const s of seasons) {
		const remote = await getTvSeason(tmdbId, s.number);
		const now = new Date();
		const seasonValues: Partial<typeof season.$inferInsert> = {};
		const airYear = yearOf(remote?.air_date);
		if (airYear) seasonValues.year = airYear;
		if (remote) seasonValues.posterUrl = imageUrl(remote.poster_path, POSTER_SIZE);
		if (Object.keys(seasonValues).length > 0) {
			await db.update(season).set(seasonValues).where(eq(season.id, s.id));
		}
		const byNumber = new Map((remote?.episodes ?? []).map((e) => [e.episode_number, e]));
		for (const ep of s.episodes) {
			const match = byNumber.get(ep.number);
			const values: Partial<typeof episode.$inferInsert> = { metadataUpdatedAt: now };
			if (match) {
				if (match.name?.trim()) values.title = match.name.trim();
				if (match.overview) values.synopsis = match.overview;
				if (ep.runtimeMinutes === 0 && match.runtime) values.runtimeMinutes = match.runtime;
				values.stillUrl = imageUrl(match.still_path, STILL_SIZE);
			}
			await db.update(episode).set(values).where(eq(episode.id, ep.id));
		}
	}
}

export async function enrichSeries(
	seriesId: string,
	opts: { force?: boolean; seasonNumbers?: number[] } = {}
): Promise<void> {
	const row = await db.query.series.findFirst({ where: eq(series.id, seriesId) });
	if (!row) return;

	// Episodes scanned after the series itself was matched: only the affected
	// seasons need fetching.
	if (opts.seasonNumbers && row.tmdbId && !opts.force) {
		await enrichSeasons(seriesId, row.tmdbId, opts.seasonNumbers);
		return;
	}
	if (!opts.force && row.metadataUpdatedAt) return;

	let tmdbId = opts.force ? null : row.tmdbId;
	if (!tmdbId) {
		tmdbId = await findTmdbId(
			searchTv,
			(r) => ({
				id: r.id,
				titles: [r.name, r.original_name],
				year: yearOf(r.first_air_date),
				popularity: r.popularity
			}),
			opts.force ? scanTitleFromSlug(row.slug, 'series') : row.title,
			row.year
		);
	}
	const details = tmdbId ? await getTv(tmdbId) : null;
	if (!details) {
		const now = new Date();
		await db
			.update(series)
			.set({ metadataUpdatedAt: now, tmdbId: tmdbId ?? null })
			.where(eq(series.id, seriesId));
		await db.update(episode).set({ metadataUpdatedAt: now }).where(eq(episode.seriesId, seriesId));
		log.info({ slug: row.slug, title: row.title, year: row.year }, 'series unmatched on tmdb');
		return;
	}
	await db.update(series).set(seriesUpdate(details, row)).where(eq(series.id, seriesId));
	await enrichSeasons(seriesId, details.id);
	log.info({ slug: row.slug, tmdbId: details.id }, 'series metadata enriched');
}

// ---------- runner ----------

/** Series already matched whose newer episodes still lack metadata → season numbers. */
async function pendingSeasonsByMatchedSeries(): Promise<Map<string, number[]>> {
	const rows = await db
		.selectDistinct({ seriesId: series.id, seasonNumber: season.number })
		.from(episode)
		.innerJoin(season, eq(episode.seasonId, season.id))
		.innerJoin(series, eq(episode.seriesId, series.id))
		.where(
			and(
				isNull(episode.metadataUpdatedAt),
				isNotNull(series.tmdbId),
				isNotNull(series.metadataUpdatedAt)
			)
		);
	const map = new Map<string, number[]>();
	for (const r of rows) map.set(r.seriesId, [...(map.get(r.seriesId) ?? []), r.seasonNumber]);
	return map;
}

async function runPass(force: boolean): Promise<void> {
	const [movies, shows, seasonsByShow] = await Promise.all([
		db.query.movie.findMany({
			columns: { id: true },
			where: force ? undefined : isNull(movie.metadataUpdatedAt)
		}),
		db.query.series.findMany({
			columns: { id: true },
			where: force ? undefined : isNull(series.metadataUpdatedAt)
		}),
		force ? new Map<string, number[]>() : pendingSeasonsByMatchedSeries()
	]);
	const tasks: (() => Promise<void>)[] = [
		...movies.map((m) => () => enrichMovie(m.id, { force })),
		...shows.map((s) => () => enrichSeries(s.id, { force })),
		...[...seasonsByShow].map(
			([seriesId, seasonNumbers]) =>
				() =>
					enrichSeries(seriesId, { seasonNumbers })
		)
	];
	if (tasks.length === 0) return;
	log.info(
		{ movies: movies.length, series: shows.length, seasons: seasonsByShow.size, force },
		'metadata enrichment pass'
	);
	await workPool(tasks);
}

/**
 * Enrich everything that still needs it (or everything, with `force`).
 * Single-flight: a call during a pass schedules one more pass afterwards,
 * so a scan finishing mid-run isn't missed. Safe to fire-and-forget.
 */
export async function enrichPending(opts: { force?: boolean } = {}): Promise<void> {
	if (!isTmdbConfigured()) return;
	if (running) {
		queued = { force: Boolean(opts.force || queued?.force) };
		return;
	}
	running = true;
	let next: { force: boolean } | null = { force: Boolean(opts.force) };
	try {
		while (next) {
			queued = null;
			await runPass(next.force);
			next = queued;
		}
	} finally {
		running = false;
		queued = null;
	}
}

export interface MetadataStatus {
	configured: boolean;
	running: boolean;
	pending: { movies: number; series: number; episodes: number };
}

export async function metadataStatus(): Promise<MetadataStatus> {
	const [[m], [s], [e]] = await Promise.all([
		db.select({ n: count() }).from(movie).where(isNull(movie.metadataUpdatedAt)),
		db.select({ n: count() }).from(series).where(isNull(series.metadataUpdatedAt)),
		db.select({ n: count() }).from(episode).where(isNull(episode.metadataUpdatedAt))
	]);
	return {
		configured: isTmdbConfigured(),
		running,
		pending: { movies: m.n, series: s.n, episodes: e.n }
	};
}
