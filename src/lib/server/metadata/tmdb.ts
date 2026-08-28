import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { log } from '$lib/server/log';

/**
 * Thin TMDB v3 client. Every response goes through a lenient zod schema
 * (unknown keys stripped, most fields nullish) so an API drift degrades to
 * "no metadata" rather than a crash in the enrichment loop.
 *
 * TMDB_API_KEY accepts either a v4 "API Read Access Token" (a JWT, sent as a
 * bearer) or a classic v3 key (sent as ?api_key=).
 */

const API_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const REQUEST_TIMEOUT_MS = 10_000;

export type ImageSize = 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original';

export function isTmdbConfigured(): boolean {
	return Boolean(env.TMDB_API_KEY?.trim());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function tmdbGet<T>(
	path: string,
	params: Record<string, string | number | undefined>,
	schema: z.ZodType<T>
): Promise<T | null> {
	const key = env.TMDB_API_KEY?.trim();
	if (!key) return null;
	const bearer = key.startsWith('eyJ');
	const url = new URL(API_BASE + path);
	for (const [name, value] of Object.entries(params)) {
		if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
	}
	if (!bearer) url.searchParams.set('api_key', key);
	const headers: Record<string, string> = { accept: 'application/json' };
	if (bearer) headers.authorization = `Bearer ${key}`;

	for (let attempt = 0; attempt < 2; attempt++) {
		let res: Response;
		try {
			res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		} catch (err) {
			log.warn({ err, path }, 'tmdb request failed');
			return null;
		}
		if (res.status === 429 && attempt === 0) {
			const retryAfter = Number(res.headers.get('retry-after')) || 2;
			await sleep(retryAfter * 1000);
			continue;
		}
		if (res.status === 404) return null;
		if (!res.ok) {
			log.warn({ status: res.status, path }, 'tmdb request rejected (check TMDB_API_KEY)');
			return null;
		}
		const body: unknown = await res.json().catch(() => null);
		const parsed = schema.safeParse(body);
		if (!parsed.success) {
			log.warn({ path, issues: z.prettifyError(parsed.error) }, 'tmdb response failed validation');
			return null;
		}
		return parsed.data;
	}
	return null;
}

export function imageUrl(path: string | null | undefined, size: ImageSize): string | null {
	return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

// ---------- schemas ----------

const TmdbGenre = z.object({ id: z.number(), name: z.string() });
const CastMember = z.object({
	name: z.string(),
	character: z.string().nullish(),
	profile_path: z.string().nullish(),
	order: z.number().nullish()
});
const CrewMember = z.object({ name: z.string(), job: z.string().nullish() });
const Credits = z
	.object({ cast: z.array(CastMember).nullish(), crew: z.array(CrewMember).nullish() })
	.nullish();

export const SearchMovieResult = z.object({
	id: z.number(),
	title: z.string().nullish(),
	original_title: z.string().nullish(),
	release_date: z.string().nullish(),
	popularity: z.number().nullish()
});
export const SearchTvResult = z.object({
	id: z.number(),
	name: z.string().nullish(),
	original_name: z.string().nullish(),
	first_air_date: z.string().nullish(),
	popularity: z.number().nullish()
});
const SearchMovieResponse = z.object({ results: z.array(SearchMovieResult) });
const SearchTvResponse = z.object({ results: z.array(SearchTvResult) });

export const ReleaseDates = z.object({
	results: z.array(
		z.object({
			iso_3166_1: z.string(),
			release_dates: z.array(
				z.object({ certification: z.string().nullish(), type: z.number().nullish() })
			)
		})
	)
});
export const ContentRatings = z.object({
	results: z.array(z.object({ iso_3166_1: z.string(), rating: z.string().nullish() }))
});

export const Video = z.object({
	key: z.string(),
	site: z.string().nullish(),
	type: z.string().nullish(),
	official: z.boolean().nullish(),
	iso_639_1: z.string().nullish(),
	published_at: z.string().nullish()
});
export const Videos = z.object({ results: z.array(Video).nullish() }).nullish();

export const MovieDetails = z.object({
	id: z.number(),
	title: z.string().nullish(),
	tagline: z.string().nullish(),
	overview: z.string().nullish(),
	release_date: z.string().nullish(),
	runtime: z.number().nullish(),
	budget: z.number().nullish(),
	vote_average: z.number().nullish(),
	poster_path: z.string().nullish(),
	backdrop_path: z.string().nullish(),
	genres: z.array(TmdbGenre).nullish(),
	credits: Credits,
	release_dates: ReleaseDates.nullish(),
	videos: Videos
});

export const TvDetails = z.object({
	id: z.number(),
	name: z.string().nullish(),
	tagline: z.string().nullish(),
	overview: z.string().nullish(),
	first_air_date: z.string().nullish(),
	last_air_date: z.string().nullish(),
	status: z.string().nullish(),
	vote_average: z.number().nullish(),
	poster_path: z.string().nullish(),
	backdrop_path: z.string().nullish(),
	genres: z.array(TmdbGenre).nullish(),
	created_by: z.array(z.object({ name: z.string() })).nullish(),
	seasons: z
		.array(z.object({ season_number: z.number(), air_date: z.string().nullish() }))
		.nullish(),
	credits: Credits,
	content_ratings: ContentRatings.nullish(),
	videos: Videos
});

export const TvSeason = z.object({
	air_date: z.string().nullish(),
	poster_path: z.string().nullish(),
	episodes: z
		.array(
			z.object({
				episode_number: z.number(),
				name: z.string().nullish(),
				overview: z.string().nullish(),
				runtime: z.number().nullish(),
				still_path: z.string().nullish()
			})
		)
		.nullish()
});

export type Video = z.infer<typeof Video>;
export type SearchMovieResult = z.infer<typeof SearchMovieResult>;
export type SearchTvResult = z.infer<typeof SearchTvResult>;
export type MovieDetails = z.infer<typeof MovieDetails>;
export type TvDetails = z.infer<typeof TvDetails>;
export type TvSeason = z.infer<typeof TvSeason>;

// ---------- endpoints ----------

export async function searchMovie(query: string, year?: number): Promise<SearchMovieResult[]> {
	const res = await tmdbGet(
		'/search/movie',
		{ query, year, include_adult: 'false' },
		SearchMovieResponse
	);
	return res?.results ?? [];
}

export async function searchTv(query: string, year?: number): Promise<SearchTvResult[]> {
	const res = await tmdbGet(
		'/search/tv',
		{ query, first_air_date_year: year, include_adult: 'false' },
		SearchTvResponse
	);
	return res?.results ?? [];
}

export function getMovie(id: number): Promise<MovieDetails | null> {
	return tmdbGet(
		`/movie/${id}`,
		{ append_to_response: 'credits,release_dates,videos' },
		MovieDetails
	);
}

export function getTv(id: number): Promise<TvDetails | null> {
	return tmdbGet(`/tv/${id}`, { append_to_response: 'credits,content_ratings,videos' }, TvDetails);
}

export function getTvSeason(id: number, seasonNumber: number): Promise<TvSeason | null> {
	return tmdbGet(`/tv/${id}/season/${seasonNumber}`, {}, TvSeason);
}
