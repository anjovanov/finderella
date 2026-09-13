import { db } from '$lib/server/db';
import { movie, series } from '$lib/server/db/schema';
import { knownGenres } from '$lib/server/catalog';
import { log } from '$lib/server/log';
import type { SearchResult } from '$lib/data';
import { createSearchIndex, searchIndex, type SearchDoc, type SearchIndex } from './engine';

/**
 * Process-wide catalog search index (the hub is single-process by design —
 * same assumption as GatewayRegistry and the site-settings cache).
 *
 * The index is rebuilt lazily: bulk catalog writers (scan finalize, prune,
 * TMDB enrichment) call `invalidateSearchIndex()`, and the next query rebuilds
 * it once. A full rebuild is two narrow selects plus `addAll` over a few
 * thousand documents at most — tens of milliseconds — so there is no
 * incremental update path to keep in sync.
 */

let index: SearchIndex | null = null;
let stale = true;
let building: Promise<SearchIndex> | null = null;

/** Marks the index stale; the next query rebuilds it (coalesced). */
export function invalidateSearchIndex(): void {
	stale = true;
}

/** Fire-and-forget warm-up for the boot hook, so the first search is instant. */
export function warmSearchIndex(): void {
	void ensureIndex().catch(() => {});
}

export async function searchCatalog(query: string, limit = 8): Promise<SearchResult[]> {
	let current: SearchIndex;
	try {
		current = await ensureIndex();
	} catch (err) {
		log.error({ err }, 'search index rebuild failed');
		// Keep serving the previous index (if any); `stale` stays set so the
		// next query retries the rebuild.
		if (!index) throw err;
		current = index;
	}
	return searchIndex(current, query, limit);
}

async function ensureIndex(): Promise<SearchIndex> {
	if (index && !stale) return index;
	if (!building) {
		building = (async () => {
			// Cleared before the load so an invalidate that lands mid-build
			// re-marks the (about to be outdated) index stale.
			stale = false;
			const started = performance.now();
			const docs = await loadSearchDocs();
			index = createSearchIndex(docs);
			log.info(
				{
					movies: docs.filter((d) => d.kind === 'movie').length,
					series: docs.length - docs.filter((d) => d.kind === 'movie').length,
					ms: Math.round(performance.now() - started)
				},
				'search index built'
			);
			return index;
		})().finally(() => {
			building = null;
		});
	}
	return building;
}

function people(lead: string, cast: { name: string }[] | null): string {
	return [lead, ...(cast ?? []).map((c) => c.name)].filter(Boolean).join(' ');
}

async function loadSearchDocs(): Promise<SearchDoc[]> {
	const [movies, shows] = await Promise.all([
		db
			.select({
				slug: movie.slug,
				title: movie.title,
				year: movie.year,
				posterUrl: movie.posterUrl,
				genres: movie.genres,
				castPeople: movie.castPeople,
				lead: movie.director,
				tagline: movie.tagline,
				synopsis: movie.synopsis
			})
			.from(movie),
		db
			.select({
				slug: series.slug,
				title: series.title,
				year: series.year,
				posterUrl: series.posterUrl,
				genres: series.genres,
				castPeople: series.castPeople,
				lead: series.creator,
				tagline: series.tagline,
				synopsis: series.synopsis
			})
			.from(series)
	]);
	const toDoc = (kind: SearchDoc['kind'], row: (typeof movies)[number]): SearchDoc => ({
		id: `${kind}:${row.slug}`,
		kind,
		slug: row.slug,
		title: row.title,
		year: row.year,
		yearText: String(row.year),
		people: people(row.lead, row.castPeople),
		tagline: row.tagline ?? '',
		synopsis: row.synopsis,
		posterUrl: row.posterUrl ?? undefined,
		genres: knownGenres(row.genres)
	});
	return [...movies.map((r) => toDoc('movie', r)), ...shows.map((r) => toDoc('series', r))];
}
