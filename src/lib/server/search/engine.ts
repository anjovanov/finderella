import MiniSearch, { type SearchOptions } from 'minisearch';
import type { Genre, SearchResult } from '$lib/data';

/**
 * Pure search engine over the catalog (no DB): builds a MiniSearch index from
 * flat documents and ranks queries. Kept DB-free so ranking is unit-testable;
 * `./index.ts` owns loading rows and the process-wide singleton.
 *
 * Matching: prefix on every term (instant results while typing), fuzzy
 * (edit distance ≈ 20 % of the term, max 2) on terms longer than three
 * characters — short terms are prefix-only so `inc` stays precise, and
 * numeric terms are never fuzzed so a year matches exactly (2010 must not
 * pull in 2011/2019). Multi-word queries try AND first for precision, then
 * fall back to OR so a stray word or a heavy typo still returns something.
 */

export interface SearchDoc {
	/** `${kind}:${slug}` — movies and series may share a slug. */
	id: string;
	kind: 'movie' | 'series';
	slug: string;
	title: string;
	year: number;
	/** `String(year)`, indexed as its own token. */
	yearText: string;
	/** Director/creator + cast names, space-joined. */
	people: string;
	tagline: string;
	synopsis: string;
	posterUrl?: string;
	genres: Genre[];
}

export type SearchIndex = MiniSearch<SearchDoc>;

/**
 * Lowercases and strips diacritics (NFD + combining marks) so `amelie` finds
 * "Amélie". Applied to both indexed text and query terms (MiniSearch reuses
 * `processTerm` for queries unless `searchOptions.processTerm` overrides it —
 * don't set that separately, or the two sides stop agreeing).
 */
export function normalizeTerm(term: string): string | null {
	const t = term
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase();
	return t.length > 0 ? t : null;
}

/** Whole-string normalization for the exact-title bonus. */
function normalizeText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/[\s\p{P}]+/gu, ' ')
		.trim();
}

const FIELDS: (keyof SearchDoc)[] = ['title', 'yearText', 'people', 'tagline', 'synopsis'];
const STORE_FIELDS: (keyof SearchDoc)[] = ['kind', 'slug', 'title', 'year', 'posterUrl', 'genres'];

const BASE_OPTIONS: SearchOptions = {
	boost: { title: 8, yearText: 3, people: 3, tagline: 1.5, synopsis: 1 },
	prefix: true,
	fuzzy: (term) => (/^\d+$/.test(term) || term.length <= 3 ? false : 0.2),
	maxFuzzy: 2
};

export function createSearchIndex(docs: SearchDoc[]): SearchIndex {
	const index = new MiniSearch<SearchDoc>({
		idField: 'id',
		fields: FIELDS,
		storeFields: STORE_FIELDS,
		processTerm: normalizeTerm,
		searchOptions: BASE_OPTIONS
	});
	index.addAll(docs);
	return index;
}

export function searchIndex(index: SearchIndex, query: string, limit: number): SearchResult[] {
	const q = query.trim();
	if (!q || limit <= 0) return [];
	const exact = normalizeText(q);
	const options: SearchOptions = {
		// An exact title wins over titles that merely contain the query
		// ("Inception" above "Inception: The Making Of").
		boostDocument: (_id, _term, stored) =>
			stored && normalizeText(String(stored.title)) === exact ? 2 : 1
	};
	let hits = index.search(q, { ...options, combineWith: 'AND' });
	if (hits.length === 0) hits = index.search(q, { ...options, combineWith: 'OR' });
	return hits.slice(0, limit).map((hit) => ({
		kind: hit.kind as SearchDoc['kind'],
		id: hit.slug as string,
		title: hit.title as string,
		year: hit.year as number,
		posterUrl: (hit.posterUrl as string | null | undefined) ?? undefined,
		genres: hit.genres as Genre[],
		score: hit.score
	}));
}
