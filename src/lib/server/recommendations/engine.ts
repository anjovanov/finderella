/**
 * Recommendations engine — pure (no I/O), unit-tested in engine.test.ts. The
 * server builds `RecItem`s from catalog rows and `WatchSignal`s from a
 * profile's watch progress / watchlist (./index.ts).
 *
 * The approach scales the streaming-service recipe down to one household:
 * there are too few viewers to learn collaborative filtering locally, so it is
 * borrowed from TMDB (`/recommendations`, built from TMDB users' behaviour) and
 * blended with content similarity (IDF-weighted keywords, genres, people,
 * studios, language). A profile's taste is the weighted sum of what it
 * finished / is watching / saved / abandoned, decayed by recency; rows are
 * re-ranked for diversity (MMR) and rotate daily through a seeded jitter.
 *
 * Keys are opaque strings (the server uses `watchlistKey`: `m:slug` / `s:slug`).
 */

export type RecKind = 'movie' | 'series';

export interface RecItem {
	key: string;
	/** Catalog row uuid (watch progress / play history reference titles by it). */
	id: string;
	kind: RecKind;
	tmdbId: number | null;
	/** Genre terms — mapped names and raw TMDB ids, so pre-TMDB rows still match. */
	genres: string[];
	/** TMDB keyword ids. */
	keywords: number[];
	/** Top-billed cast names. */
	people: string[];
	/** Directors (movies) / creators (series). */
	makers: string[];
	/** Studio / network brand slugs. */
	studios: string[];
	collectionId: number | null;
	/** ISO 639-1 original language. */
	language: string | null;
	year: number;
	/** TMDB vote average, 0–10. */
	rating: number;
	voteCount: number | null;
	popularity: number | null;
	/** Epoch ms the title entered the library. */
	addedAt: number;
	/** TMDB ids (same kind) TMDB recommends for this title, best first. */
	recommends: number[];
}

export interface Neighbour {
	key: string;
	score: number;
}

export interface RecModel {
	items: RecItem[];
	byKey: Map<string, RecItem>;
	/** Catalog uuid → item. */
	byId: Map<string, RecItem>;
	idf: {
		keywords: Map<number, number>;
		people: Map<string, number>;
		studios: Map<string, number>;
	};
	/** key → linked key → rank weight (1 = TMDB's top pick), both directions merged. */
	links: Map<string, Map<string, number>>;
	/** Mean TMDB rating of the library (the Bayesian prior). */
	meanRating: number;
	maxLogPopularity: number;
	/** Each item's `quality` (computed once per model). */
	quality: Map<string, number>;
	/** Lazily filled: each item's best neighbours, per kind filter (`key|kinds`). */
	neighbours: Map<string, Neighbour[]>;
	/** Lazily filled: each item's taste-feature vector and its norm. */
	features: Map<string, { vector: Map<string, number>; norm: number }>;
}

// ---------- tuning ----------

export const SIMILARITY_WEIGHTS = {
	/** TMDB recommends one for the other (collaborative signal), scaled by rank. */
	tmdbLink: 4,
	collection: 4,
	/** × IDF-weighted keyword overlap (0–1). */
	keywords: 4,
	/** × genre Jaccard (0–1). */
	genres: 2.5,
	/** Any shared director / creator. */
	makers: 2,
	/** × IDF-weighted cast overlap (0–1). */
	cast: 1.5,
	/** × IDF-weighted studio overlap (0–1). */
	studios: 1,
	/** Same non-English original language (anime, K-drama…). */
	language: 0.75
} as const;
/** A movie suggested for a series (or vice versa) keeps this share of its score. */
export const CROSS_KIND_FACTOR = 0.8;
/** Similarity at which two titles count as fully redundant for diversity. */
const SIMILARITY_SCALE = 10;
/** Neighbours memoized per title. */
export const NEIGHBOUR_LIMIT = 60;

/** Bayesian rating: votes worth of the library mean mixed into every title. */
const PRIOR_VOTES = 200;

export const SIGNAL_WEIGHTS = {
	finished: 1,
	/** In progress: base + perFraction × fraction. */
	inProgressBase: 0.3,
	inProgressPerFraction: 0.5,
	watchlisted: 0.4,
	abandoned: -0.4,
	/** Series: base + perEpisode × log2(1 + finished episodes), capped. */
	seriesBase: 0.4,
	seriesPerEpisode: 0.25,
	seriesCap: 1.2,
	/** A finished title never decays below this — lifetime taste persists. */
	finishedFloor: 0.25
} as const;
const DAY_MS = 86_400_000;
export const SIGNAL_HALF_LIFE_DAYS = 120;
/** Started but left untouched this long (below the fractions below) = abandoned. */
export const ABANDON_AFTER_DAYS = 14;
const ABANDON_MOVIE_FRACTION = 0.25;
const ABANDON_SERIES_FRACTION = 0.5;

export const PICK_WEIGHTS = {
	/** Σ seed weight × similarity, normalized. */
	itemBased: 0.55,
	/** Cosine of the candidate with the profile's taste vector. */
	taste: 0.25,
	quality: 0.15,
	freshness: 0.05,
	/** Max daily jitter, so the row rotates without reshuffling on reload. */
	jitter: 0.04
} as const;
const MAX_SEEDS = 30;
/** Negative seeds subtract at this share of their weight. */
const NEGATIVE_FACTOR = 0.5;
const FRESH_DAYS = 30;
const MMR_LAMBDA = 0.75;
const MMR_POOL = 60;
export const MAX_PER_COLLECTION = 2;

/** "Because you watched": seeds need at least this weight; rows this many titles. */
export const BECAUSE_MIN_WEIGHT = 0.6;
export const BECAUSE_MIN_ITEMS = 4;

export const TRENDING_WINDOW_DAYS = 14;
const TRENDING_HALF_LIFE_DAYS = 4;
/**
 * Local plays' share next to TMDB popularity (which counts fully). Kept small,
 * and saturating (half the boost at `TRENDING_HALF_BOOST_VIEWS` decayed
 * viewer-days), because a household has a handful of viewers: if one person's
 * play could top the row, everyone else could read off what they just watched.
 */
export const TRENDING_LOCAL_WEIGHT = 0.3;
export const TRENDING_HALF_BOOST_VIEWS = 3;

// ---------- model ----------

/** Max of `values`, 0 when empty — a loop, since spreading a whole catalog into `Math.max` can overflow the stack. */
function maxOf(values: Iterable<number>): number {
	let max = 0;
	for (const v of values) if (v > max) max = v;
	return max;
}

function idfTable<T>(lists: T[][]): Map<T, number> {
	const df = new Map<T, number>();
	for (const list of lists) {
		for (const term of new Set(list)) df.set(term, (df.get(term) ?? 0) + 1);
	}
	const n = lists.length;
	return new Map([...df].map(([term, count]) => [term, Math.log(1 + n / count)]));
}

/** Rank weight of a TMDB recommendation: 1 for the first, 0.5 for the last of a page. */
function linkWeight(rank: number, count: number): number {
	return count <= 1 ? 1 : 1 - (0.5 * rank) / (count - 1);
}

export function buildModel(input: RecItem[]): RecModel {
	const unique = <T>(list: T[]) => [...new Set(list)];
	const items = input.map((i) => ({
		...i,
		genres: unique(i.genres),
		keywords: unique(i.keywords),
		people: unique(i.people),
		makers: unique(i.makers),
		studios: unique(i.studios)
	}));
	const byKey = new Map(items.map((i) => [i.key, i]));
	const byTmdb = new Map<string, RecItem>();
	for (const item of items) {
		if (item.tmdbId !== null) byTmdb.set(`${item.kind}:${item.tmdbId}`, item);
	}
	const links = new Map<string, Map<string, number>>();
	const link = (a: string, b: string, weight: number) => {
		let map = links.get(a);
		if (!map) links.set(a, (map = new Map()));
		map.set(b, Math.max(map.get(b) ?? 0, weight));
	};
	for (const item of items) {
		item.recommends.forEach((tmdbId, rank) => {
			const other = byTmdb.get(`${item.kind}:${tmdbId}`);
			if (!other || other.key === item.key) return;
			const weight = linkWeight(rank, item.recommends.length);
			link(item.key, other.key, weight);
			link(other.key, item.key, weight);
		});
	}
	const rated = items.filter((i) => i.rating > 0);
	const model: RecModel = {
		items,
		byKey,
		byId: new Map(items.map((i) => [i.id, i])),
		idf: {
			keywords: idfTable(items.map((i) => i.keywords)),
			people: idfTable(items.map((i) => i.people)),
			studios: idfTable(items.map((i) => i.studios))
		},
		links,
		meanRating: rated.length ? rated.reduce((sum, i) => sum + i.rating, 0) / rated.length : 6.5,
		maxLogPopularity: maxOf(items.map((i) => Math.log1p(i.popularity ?? 0))),
		quality: new Map(),
		neighbours: new Map(),
		features: new Map()
	};
	for (const item of items) model.quality.set(item.key, computeQuality(model, item));
	return model;
}

// ---------- item ↔ item ----------

/**
 * Σ idf(shared) / √(Σ idf(a) · Σ idf(b)) — 0..1, rare shared terms count most.
 * Lists are de-duplicated by `buildModel` and short, so `includes` beats Sets.
 */
function weightedOverlap<T>(a: T[], b: T[], idf: Map<T, number>): number {
	if (a.length === 0 || b.length === 0) return 0;
	let shared = 0;
	for (const t of a) if (b.includes(t)) shared += idf.get(t) ?? 0;
	if (shared === 0) return 0;
	const sum = (list: T[]) => list.reduce((s, t) => s + (idf.get(t) ?? 0), 0);
	return shared / Math.sqrt(sum(a) * sum(b));
}

function jaccard(a: string[], b: string[]): number {
	if (a.length === 0 || b.length === 0) return 0;
	const shared = a.filter((t) => b.includes(t)).length;
	return shared / (a.length + b.length - shared);
}

/** How alike two titles are (0 = nothing in common; ~10 = very close). */
export function similarity(model: RecModel, a: RecItem, b: RecItem): number {
	const w = SIMILARITY_WEIGHTS;
	let score = 0;
	score += w.tmdbLink * (model.links.get(a.key)?.get(b.key) ?? 0);
	if (a.collectionId !== null && a.collectionId === b.collectionId) score += w.collection;
	score += w.keywords * weightedOverlap(a.keywords, b.keywords, model.idf.keywords);
	score += w.genres * jaccard(a.genres, b.genres);
	if (a.makers.some((m) => b.makers.includes(m))) score += w.makers;
	score += w.cast * weightedOverlap(a.people, b.people, model.idf.people);
	score += w.studios * weightedOverlap(a.studios, b.studios, model.idf.studios);
	if (a.language && a.language !== 'en' && a.language === b.language) score += w.language;
	return a.kind === b.kind ? score : score * CROSS_KIND_FACTOR;
}

/** TMDB popularity on a 0..1 log scale (0 when unknown, or when no title has any). */
function normalizedPopularity(model: RecModel, item: RecItem): number {
	return model.maxLogPopularity > 0 ? Math.log1p(item.popularity ?? 0) / model.maxLogPopularity : 0;
}

function computeQuality(model: RecModel, item: RecItem): number {
	// Unknown vote counts (not yet backfilled) weigh like the prior.
	const votes = item.voteCount ?? PRIOR_VOTES;
	const bayes = (votes * item.rating + PRIOR_VOTES * model.meanRating) / (votes + PRIOR_VOTES);
	return 0.7 * (bayes / 10) + 0.3 * normalizedPopularity(model, item);
}

/** Bayesian-averaged rating blended with TMDB popularity, 0..1. */
export function quality(model: RecModel, item: RecItem): number {
	return model.quality.get(item.key) ?? 0;
}

/**
 * The memoized best neighbours of `key`, best first (empty for an unknown key).
 * `kinds` filters the candidates *before* the cut to `NEIGHBOUR_LIMIT`, so a
 * movies-only list isn't starved by series that took the top slots.
 */
export function neighbours(model: RecModel, key: string, kinds?: RecKind[]): Neighbour[] {
	const memoKey = `${key}|${kinds?.join(',') ?? '*'}`;
	const cached = model.neighbours.get(memoKey);
	if (cached) return cached;
	const target = model.byKey.get(key);
	if (!target) return [];
	const ranked = model.items
		.filter((c) => c.key !== key && (!kinds || kinds.includes(c.kind)))
		.map((c) => ({ c, score: similarity(model, target, c) }))
		.filter(({ score }) => score > 0)
		.sort(
			(a, b) =>
				b.score - a.score ||
				quality(model, b.c) - quality(model, a.c) ||
				Math.abs(a.c.year - target.year) - Math.abs(b.c.year - target.year)
		)
		.slice(0, NEIGHBOUR_LIMIT)
		.map(({ c, score }) => ({ key: c.key, score }));
	model.neighbours.set(memoKey, ranked);
	return ranked;
}

/** "More like this": keys of the titles most like `key`, optionally of some kinds only. */
export function moreLikeThis(
	model: RecModel,
	key: string,
	opts: { limit?: number; kinds?: RecKind[] } = {}
): string[] {
	const { limit = 20, kinds } = opts;
	return neighbours(model, key, kinds)
		.slice(0, limit)
		.map((n) => n.key);
}

// ---------- viewer signals ----------

export interface WatchSignal {
	key: string;
	/** Present once the profile played the title (positions under the resume threshold don't count). */
	watched?: {
		/** Movies: watched fraction; series: the latest episode's. 1 = finished. */
		fraction: number;
		/** Series only. */
		finishedEpisodes?: number;
		startedEpisodes?: number;
		/** Epoch ms of the latest progress. */
		at: number;
	};
	/** Epoch ms the title was added to the watchlist. */
	watchlistedAt?: number;
}

function decay(weight: number, at: number, now: number): number {
	const ageDays = Math.max(0, now - at) / DAY_MS;
	return weight * 0.5 ** (ageDays / SIGNAL_HALF_LIFE_DAYS);
}

/**
 * How strongly one signal says "more like this" (positive) or "not this kind
 * of thing" (negative, abandoned early). Recency-decayed; finished titles keep
 * a floor. 0 = no signal.
 */
export function interactionWeight(model: RecModel, signal: WatchSignal, now: number): number {
	const item = model.byKey.get(signal.key);
	if (!item) return 0;
	const w = SIGNAL_WEIGHTS;
	const watched = signal.watched;
	if (!watched) {
		return signal.watchlistedAt !== undefined ? decay(w.watchlisted, signal.watchlistedAt, now) : 0;
	}
	const stale = now - watched.at >= ABANDON_AFTER_DAYS * DAY_MS;
	if (item.kind === 'movie') {
		if (watched.fraction >= 1) return Math.max(decay(w.finished, watched.at, now), w.finishedFloor);
		if (stale && watched.fraction < ABANDON_MOVIE_FRACTION) {
			return decay(w.abandoned, watched.at, now);
		}
		return decay(w.inProgressBase + w.inProgressPerFraction * watched.fraction, watched.at, now);
	}
	const finished = watched.finishedEpisodes ?? 0;
	if (
		stale &&
		finished === 0 &&
		(watched.startedEpisodes ?? 1) <= 1 &&
		watched.fraction < ABANDON_SERIES_FRACTION
	) {
		return decay(w.abandoned, watched.at, now);
	}
	const base = Math.min(w.seriesCap, w.seriesBase + w.seriesPerEpisode * Math.log2(1 + finished));
	const weight = decay(base, watched.at, now);
	return finished > 0 ? Math.max(weight, w.finishedFloor) : weight;
}

// ---------- taste ----------

/** A title's taste features and their norm (memoized): what a profile's taste vector is made of. */
function featureVector(
	model: RecModel,
	item: RecItem
): { vector: Map<string, number>; norm: number } {
	const cached = model.features.get(item.key);
	if (cached) return cached;
	const features = new Map<string, number>();
	const maxIdf = Math.log(1 + model.items.length);
	for (const g of item.genres) features.set(`g:${g}`, 1);
	for (const k of item.keywords) features.set(`k:${k}`, (model.idf.keywords.get(k) ?? 0) / maxIdf);
	for (const m of item.makers) features.set(`m:${m}`, 1.5);
	for (const p of item.people) {
		features.set(`p:${p}`, (0.5 * (model.idf.people.get(p) ?? 0)) / maxIdf);
	}
	for (const s of item.studios) {
		features.set(`s:${s}`, (0.5 * (model.idf.studios.get(s) ?? 0)) / maxIdf);
	}
	if (item.language && item.language !== 'en') features.set(`l:${item.language}`, 1);
	const entry = { vector: features, norm: norm(features) };
	model.features.set(item.key, entry);
	return entry;
}

function norm(vector: Map<string, number>): number {
	let sum = 0;
	for (const v of vector.values()) sum += v * v;
	return Math.sqrt(sum);
}

function cosine(
	a: Map<string, number>,
	aNorm: number,
	b: Map<string, number>,
	bNorm: number
): number {
	if (aNorm === 0 || bNorm === 0) return 0;
	let dot = 0;
	for (const [term, v] of b) dot += v * (a.get(term) ?? 0);
	return Math.max(0, dot / (aNorm * bNorm));
}

// ---------- ranking ----------

/** FNV-1a — a stable 0..1 jitter per (seed, title), so a row rotates by day, not by reload. */
export function jitter(seed: string, key: string): number {
	let hash = 0x811c9dc5;
	for (const ch of `${seed}|${key}`) {
		hash ^= ch.codePointAt(0)!;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) / 0xffffffff;
}

function freshness(item: RecItem, now: number): number {
	return now - item.addedAt <= FRESH_DAYS * DAY_MS ? 1 : 0;
}

/**
 * Maximal marginal relevance: greedily take the best-scored title, penalizing
 * ones too similar to what's already picked; at most `MAX_PER_COLLECTION` per
 * TMDB collection (a row shouldn't be one franchise).
 */
export function diversify(
	model: RecModel,
	ranked: { key: string; score: number }[],
	limit: number
): string[] {
	const pool = ranked.slice(0, MMR_POOL).map((r) => ({
		...r,
		item: model.byKey.get(r.key)!,
		/** Max similarity to anything picked so far, 0..1 (updated per pick). */
		redundancy: 0
	}));
	const top = pool[0]?.score ?? 0;
	const bottom = pool.at(-1)?.score ?? 0;
	const span = top - bottom || 1;
	const picked: RecItem[] = [];
	const perCollection = new Map<number, number>();
	while (picked.length < limit && pool.length > 0) {
		let best = -1;
		let bestValue = -Infinity;
		pool.forEach(({ item, score, redundancy }, i) => {
			const collection = item.collectionId;
			if (collection !== null && (perCollection.get(collection) ?? 0) >= MAX_PER_COLLECTION) {
				return;
			}
			const value = MMR_LAMBDA * ((score - bottom) / span) - (1 - MMR_LAMBDA) * redundancy;
			if (value > bestValue) {
				bestValue = value;
				best = i;
			}
		});
		if (best < 0) break;
		const [{ item }] = pool.splice(best, 1);
		picked.push(item);
		if (item.collectionId !== null) {
			perCollection.set(item.collectionId, (perCollection.get(item.collectionId) ?? 0) + 1);
		}
		for (const candidate of pool) {
			const sim = Math.min(1, similarity(model, candidate.item, item) / SIMILARITY_SCALE);
			candidate.redundancy = Math.max(candidate.redundancy, sim);
		}
	}
	return picked.map((p) => p.key);
}

export interface PickOptions {
	now: number;
	/** Stable per viewer (profile id; '' for guests) — combined with the day for jitter. */
	seed: string;
	limit?: number;
}

/** Titles the profile has started, finished or abandoned. */
function seenKeys(signals: WatchSignal[]): Set<string> {
	return new Set(signals.filter((s) => s.watched).map((s) => s.key));
}

function daySeed(opts: PickOptions): string {
	return `${opts.seed}|${Math.floor(opts.now / DAY_MS)}`;
}

/** Cold start (guests, new profiles): quality + popularity, diversified. */
export function popularPicks(
	model: RecModel,
	opts: PickOptions & { exclude?: Set<string> }
): string[] {
	const { now, limit = 20, exclude } = opts;
	const seed = daySeed(opts);
	const ranked = model.items
		.filter((i) => !exclude?.has(i.key))
		.map((i) => ({
			key: i.key,
			score:
				quality(model, i) +
				PICK_WEIGHTS.freshness * freshness(i, now) +
				PICK_WEIGHTS.jitter * jitter(seed, i.key)
		}))
		.sort((a, b) => b.score - a.score);
	return diversify(model, ranked, limit);
}

export interface TopPicks {
	keys: string[];
	/** False when the profile had no positive signal (cold start). */
	personal: boolean;
}

/** "Top picks for you": the library ranked for one profile's taste. */
export function recommendFor(model: RecModel, signals: WatchSignal[], opts: PickOptions): TopPicks {
	const { now, limit = 20 } = opts;
	const seen = seenKeys(signals);
	const weighted = signals
		.map((s) => ({ key: s.key, weight: interactionWeight(model, s, now) }))
		.filter((s) => s.weight !== 0);
	const positives = weighted
		.filter((s) => s.weight > 0)
		.sort((a, b) => b.weight - a.weight)
		.slice(0, MAX_SEEDS);
	if (positives.length === 0) {
		return { keys: popularPicks(model, { ...opts, exclude: seen }), personal: false };
	}
	const negatives = weighted.filter((s) => s.weight < 0);

	// Item-based: neighbours of what the profile liked, minus those of what it abandoned.
	const itemScore = new Map<string, number>();
	for (const { key, weight } of [...positives, ...negatives]) {
		const factor = weight > 0 ? weight : weight * NEGATIVE_FACTOR;
		for (const n of neighbours(model, key)) {
			itemScore.set(n.key, (itemScore.get(n.key) ?? 0) + factor * n.score);
		}
	}
	const maxItemScore = maxOf(itemScore.values()) || 1;

	// Taste vector: the seeds' features, weighted.
	const taste = new Map<string, number>();
	for (const { key, weight } of positives) {
		for (const [term, v] of featureVector(model, model.byKey.get(key)!).vector) {
			taste.set(term, (taste.get(term) ?? 0) + weight * v);
		}
	}
	const tasteNorm = norm(taste);

	const seed = daySeed(opts);
	const ranked = model.items
		.filter((i) => !seen.has(i.key))
		.map((i) => {
			const features = featureVector(model, i);
			return {
				key: i.key,
				score:
					PICK_WEIGHTS.itemBased * ((itemScore.get(i.key) ?? 0) / maxItemScore) +
					PICK_WEIGHTS.taste * cosine(taste, tasteNorm, features.vector, features.norm) +
					PICK_WEIGHTS.quality * quality(model, i) +
					PICK_WEIGHTS.freshness * freshness(i, now) +
					PICK_WEIGHTS.jitter * jitter(seed, i.key)
			};
		})
		.sort((a, b) => b.score - a.score);
	return { keys: diversify(model, ranked, limit), personal: true };
}

export interface BecauseRow {
	seedKey: string;
	keys: string[];
}

/**
 * "Because you watched X" rows: the most recent strongly-liked titles (one per
 * collection) and their unseen neighbours, avoiding `exclude` and earlier rows
 * unless that would leave fewer than `BECAUSE_MIN_ITEMS` (small libraries
 * would otherwise never get the row). Rows that still fall short are dropped.
 */
export function becauseYouWatched(
	model: RecModel,
	signals: WatchSignal[],
	opts: { now: number; rows?: number; limit?: number; exclude?: Iterable<string> }
): BecauseRow[] {
	const { now, rows = 2, limit = 20 } = opts;
	const seen = seenKeys(signals);
	const used = new Set(opts.exclude);
	const usedCollections = new Set<number>();
	const seeds = signals
		.filter((s) => s.watched && interactionWeight(model, s, now) >= BECAUSE_MIN_WEIGHT)
		.sort((a, b) => b.watched!.at - a.watched!.at);
	const result: BecauseRow[] = [];
	for (const signal of seeds) {
		if (result.length >= rows) break;
		const item = model.byKey.get(signal.key)!;
		if (item.collectionId !== null && usedCollections.has(item.collectionId)) continue;
		const unseen = neighbours(model, signal.key)
			.filter((n) => !seen.has(n.key))
			.map((n) => n.key);
		const fresh = unseen.filter((key) => !used.has(key));
		const keys = (fresh.length >= BECAUSE_MIN_ITEMS ? fresh : unseen).slice(0, limit);
		if (keys.length < BECAUSE_MIN_ITEMS) continue;
		result.push({ seedKey: signal.key, keys });
		for (const key of keys) used.add(key);
		if (item.collectionId !== null) usedCollections.add(item.collectionId);
	}
	return result;
}

export interface Play {
	/** Catalog uuid of the movie / series. */
	titleId: string;
	/** Null for guests (all guests count as one viewer). */
	profileId: string | null;
	/** Epoch ms. */
	at: number;
}

/**
 * "Trending now": TMDB popularity, nudged by what viewers on this server played
 * lately — each viewer × title × day counts once (a binge doesn't dominate),
 * decayed by age, and the boost saturates (see `TRENDING_LOCAL_WEIGHT`), so a
 * single viewer's play can't push a title to the top. Titles without TMDB
 * popularity (no key, unmatched) get no boost at all: there nothing would
 * outweigh it, and the row would list exactly what someone just watched.
 * Ties fall back to quality.
 */
export function trending(
	model: RecModel,
	plays: Play[],
	opts: { now: number; limit?: number }
): string[] {
	const { now, limit = 12 } = opts;
	const local = new Map<string, number>();
	const counted = new Set<string>();
	for (const play of plays) {
		const item = model.byId.get(play.titleId);
		const ageDays = (now - play.at) / DAY_MS;
		if (!item || ageDays < 0 || ageDays > TRENDING_WINDOW_DAYS) continue;
		const bucket = `${play.profileId ?? ''}|${item.key}|${Math.floor(play.at / DAY_MS)}`;
		if (counted.has(bucket)) continue;
		counted.add(bucket);
		local.set(item.key, (local.get(item.key) ?? 0) + 0.5 ** (ageDays / TRENDING_HALF_LIFE_DAYS));
	}
	const localBoost = (key: string) =>
		1 - 0.5 ** ((local.get(key) ?? 0) / TRENDING_HALF_BOOST_VIEWS);
	return model.items
		.map((i) => {
			const popularity = normalizedPopularity(model, i);
			return {
				key: i.key,
				score: popularity > 0 ? popularity + TRENDING_LOCAL_WEIGHT * localBoost(i.key) : 0,
				quality: quality(model, i)
			};
		})
		.sort((a, b) => b.score - a.score || b.quality - a.quality)
		.slice(0, limit)
		.map((r) => r.key);
}
