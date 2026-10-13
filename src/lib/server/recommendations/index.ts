import { and, gte, isNotNull, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { movie, playHistory, series, watchlist, watchProgress } from '$lib/server/db/schema';
import { watchlistKey } from '$lib/server/watchlist';
import { log } from '$lib/server/log';
import { progressFraction } from '$lib/data/progress';
import { MIN_PLAY_SECONDS } from '$lib/data/stats';
import {
	becauseYouWatched,
	buildModel,
	moreLikeThis as rankMoreLikeThis,
	recommendFor,
	trending,
	TRENDING_WINDOW_DAYS,
	type BecauseRow,
	type Play,
	type RecItem,
	type RecKind,
	type RecModel,
	type WatchSignal
} from './engine';

/**
 * Process-wide recommendations model (single-process hub, like the search
 * index): narrow catalog columns → `RecItem`s, rebuilt lazily after
 * `invalidateRecommendations()` — called wherever `invalidateSearchIndex()` is
 * (scan finalize, prune, TMDB enrichment). Per-profile rankings are computed
 * per request from the model (neighbour lists are memoized in it).
 */

let model: RecModel | null = null;
let stale = true;
let building: Promise<RecModel> | null = null;

/** Marks the model stale; the next request rebuilds it (coalesced). */
export function invalidateRecommendations(): void {
	stale = true;
}

/** Fire-and-forget warm-up for the boot hook. */
export function warmRecommendations(): void {
	void ensureModel().catch(() => {});
}

async function currentModel(): Promise<RecModel> {
	try {
		return await ensureModel();
	} catch (err) {
		log.error({ err }, 'recommendations model rebuild failed');
		// Keep serving the previous model; `stale` stays set so the next call retries.
		if (!model) throw err;
		return model;
	}
}

async function ensureModel(): Promise<RecModel> {
	if (model && !stale) return model;
	if (!building) {
		building = (async () => {
			// Cleared before the load so an invalidate that lands mid-build re-marks it stale.
			stale = false;
			const started = performance.now();
			try {
				model = buildModel(await loadItems());
			} catch (err) {
				// Failed: stay stale so the next request retries instead of serving the old model forever.
				stale = true;
				throw err;
			}
			log.info(
				{ titles: model.items.length, ms: Math.round(performance.now() - started) },
				'recommendations model built'
			);
			return model;
		})().finally(() => {
			building = null;
		});
	}
	return building;
}

/** Top-billed cast names a title is compared on. */
const PEOPLE_LIMIT = 6;

function splitNames(names: string): string[] {
	return names
		.split(',')
		.map((n) => n.trim())
		.filter(Boolean);
}

/** The columns movies and series share. */
function itemColumns(t: typeof movie | typeof series) {
	return {
		id: t.id,
		slug: t.slug,
		tmdbId: t.tmdbId,
		genres: t.genres,
		tmdbGenreIds: t.tmdbGenreIds,
		keywords: t.keywords,
		castPeople: t.castPeople,
		studios: t.studios,
		language: t.originalLanguage,
		year: t.year,
		rating: t.rating,
		voteCount: t.voteCount,
		popularity: t.popularity,
		recommends: t.tmdbRecommendations,
		addedAt: t.addedAt
	};
}

async function loadItems(): Promise<RecItem[]> {
	const [movies, shows] = await Promise.all([
		db
			.select({
				...itemColumns(movie),
				makers: movie.director,
				collectionId: movie.collectionId
			})
			.from(movie),
		db.select({ ...itemColumns(series), makers: series.creator }).from(series)
	]);
	const toItem = (
		kind: RecKind,
		row: (typeof shows)[number] & { collectionId?: number | null }
	): RecItem => ({
		key: watchlistKey(kind, row.slug),
		id: row.id,
		kind,
		tmdbId: row.tmdbId,
		// Mapped names and raw TMDB ids together, so rows not (yet) enriched still match.
		genres: [...row.genres, ...row.tmdbGenreIds.map((id) => `tmdb:${id}`)],
		keywords: row.keywords,
		people: (row.castPeople ?? []).slice(0, PEOPLE_LIMIT).map((c) => c.name),
		makers: splitNames(row.makers),
		studios: row.studios,
		collectionId: row.collectionId ?? null,
		language: row.language,
		year: row.year,
		rating: row.rating,
		voteCount: row.voteCount,
		popularity: row.popularity,
		addedAt: row.addedAt.getTime(),
		recommends: row.recommends
	});
	return [...movies.map((r) => toItem('movie', r)), ...shows.map((r) => toItem('series', r))];
}

// ---------- viewer signals ----------

/** One profile's watch progress and watchlist as engine signals. */
async function loadSignals(profileId: string, current: RecModel): Promise<WatchSignal[]> {
	const [movieRows, episodeRows, saved] = await Promise.all([
		db
			.select({
				titleId: watchProgress.movieId,
				position: watchProgress.positionSeconds,
				duration: watchProgress.durationSeconds,
				at: watchProgress.updatedAt
			})
			.from(watchProgress)
			.where(and(eq(watchProgress.profileId, profileId), isNotNull(watchProgress.movieId))),
		db
			.select({
				titleId: watchProgress.seriesId,
				position: watchProgress.positionSeconds,
				duration: watchProgress.durationSeconds,
				at: watchProgress.updatedAt
			})
			.from(watchProgress)
			.where(and(eq(watchProgress.profileId, profileId), isNotNull(watchProgress.episodeId))),
		db
			.select({ movieId: watchlist.movieId, seriesId: watchlist.seriesId, at: watchlist.createdAt })
			.from(watchlist)
			.where(eq(watchlist.profileId, profileId))
	]);

	const signals = new Map<string, WatchSignal>();
	const signalFor = (titleId: string | null) => {
		const item = titleId ? current.byId.get(titleId) : undefined;
		if (!item) return undefined;
		let signal = signals.get(item.key);
		if (!signal) signals.set(item.key, (signal = { key: item.key }));
		return signal;
	};

	for (const row of movieRows) {
		const fraction = progressFraction(row.position, row.duration);
		const signal = fraction === undefined ? undefined : signalFor(row.titleId);
		if (signal) signal.watched = { fraction: fraction!, at: row.at.getTime() };
	}
	// Episodes collapse into their series: counts plus the latest episode's fraction.
	for (const row of episodeRows) {
		const fraction = progressFraction(row.position, row.duration);
		const signal = fraction === undefined ? undefined : signalFor(row.titleId);
		if (!signal) continue;
		const at = row.at.getTime();
		const watched = (signal.watched ??= {
			fraction: fraction!,
			finishedEpisodes: 0,
			startedEpisodes: 0,
			at
		});
		watched.startedEpisodes! += 1;
		if (fraction === 1) watched.finishedEpisodes! += 1;
		if (at >= watched.at) Object.assign(watched, { fraction: fraction!, at });
	}
	for (const row of saved) {
		const signal = signalFor(row.movieId ?? row.seriesId);
		if (signal) signal.watchlistedAt = row.at.getTime();
	}
	return [...signals.values()];
}

/** Recent plays on the server, cached briefly (every home page view reads them). */
const PLAYS_TTL_MS = 5 * 60_000;
let playsCache: { value: Play[]; expiresAt: number } | null = null;

async function recentPlays(now: number): Promise<Play[]> {
	if (playsCache && playsCache.expiresAt > now) return playsCache.value;
	const rows = await db
		.select({
			movieId: playHistory.movieId,
			seriesId: playHistory.seriesId,
			profileId: playHistory.profileId,
			at: playHistory.startedAt
		})
		.from(playHistory)
		.where(
			and(
				gte(playHistory.startedAt, new Date(now - TRENDING_WINDOW_DAYS * 86_400_000)),
				gte(playHistory.playedSeconds, MIN_PLAY_SECONDS)
			)
		);
	const value = rows.flatMap((r) => {
		const titleId = r.movieId ?? r.seriesId;
		return titleId ? [{ titleId, profileId: r.profileId, at: r.at.getTime() }] : [];
	});
	playsCache = { value, expiresAt: now + PLAYS_TTL_MS };
	return value;
}

// ---------- public API ----------

export interface HomeRecommendations {
	topPicks: string[];
	/** False = cold start (guest / no history): show it as popular picks. */
	personal: boolean;
	because: BecauseRow[];
	trending: string[];
}

/** Titles of "Top picks" that "Because you watched" rows won't repeat. */
const TOP_PICKS_SHOWN = 6;

const EMPTY_HOME: HomeRecommendations = {
	topPicks: [],
	personal: false,
	because: [],
	trending: []
};

/** The home page's recommendation rows, as `watchlistKey`s. Never throws (rows just go missing). */
export async function homeRecommendations(profileId: string | null): Promise<HomeRecommendations> {
	try {
		const now = Date.now();
		const current = await currentModel();
		const [signals, plays] = await Promise.all([
			profileId ? loadSignals(profileId, current) : [],
			recentPlays(now)
		]);
		const picks = recommendFor(current, signals, { now, seed: profileId ?? '' });
		return {
			topPicks: picks.keys,
			personal: picks.personal,
			because: becauseYouWatched(current, signals, {
				now,
				exclude: picks.keys.slice(0, TOP_PICKS_SHOWN)
			}),
			trending: trending(current, plays, { now })
		};
	} catch (err) {
		log.error({ err }, 'home recommendations failed');
		return EMPTY_HOME;
	}
}

/** "More like this" for a title, as `watchlistKey`s. Never throws. */
export async function moreLikeThis(
	kind: RecKind,
	slug: string,
	opts: { limit?: number; kinds?: RecKind[] } = {}
): Promise<string[]> {
	try {
		return rankMoreLikeThis(await currentModel(), watchlistKey(kind, slug), opts);
	} catch (err) {
		log.error({ err, kind, slug }, 'more like this failed');
		return [];
	}
}

/** Catalog items for recommended keys, in order (`itemsForKeys`; unknown keys dropped). */
export { itemsForKeys as resolveRecommended } from '$lib/server/watchlist';
