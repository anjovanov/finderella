import { GENRES, type Genre, type Maturity } from '$lib/data/types';
import { slugify } from '$lib/server/catalog/parse';

/** Pure TMDB → catalog mapping helpers (unit-tested; no I/O). */

/**
 * TMDB genre names → the fixed GENRES tuple the UI filters on. Unlisted names
 * (Animation, Family, Western, Music, Reality, …) are dropped rather than
 * widening the tuple.
 */
const GENRE_MAP: Record<string, Genre[]> = {
	action: ['Action'],
	adventure: ['Action'],
	'action & adventure': ['Action'],
	'science fiction': ['Sci-Fi'],
	'sci-fi & fantasy': ['Sci-Fi', 'Fantasy'],
	fantasy: ['Fantasy'],
	drama: ['Drama'],
	thriller: ['Thriller'],
	comedy: ['Comedy'],
	horror: ['Horror'],
	mystery: ['Mystery'],
	romance: ['Romance'],
	documentary: ['Documentary'],
	crime: ['Thriller'],
	war: ['Drama'],
	'war & politics': ['Drama'],
	history: ['Drama'],
	soap: ['Drama']
};

export function mapGenres(names: Iterable<string>): Genre[] {
	const out: Genre[] = [];
	for (const name of names) {
		for (const genre of GENRE_MAP[name.trim().toLowerCase()] ?? []) {
			if (!out.includes(genre) && (GENRES as readonly string[]).includes(genre)) out.push(genre);
		}
	}
	return out;
}

const MOVIE_CERTS: Record<string, Maturity> = {
	G: 'G',
	PG: 'PG',
	'PG-13': 'PG-13',
	R: 'R',
	'NC-17': 'R'
};

/** US theatrical certification (type 3) preferred, else the first US one. */
export function movieMaturity(
	releaseDates:
		| {
				results: {
					iso_3166_1: string;
					release_dates: { certification?: string | null; type?: number | null }[];
				}[];
		  }
		| null
		| undefined
): Maturity | undefined {
	const us = releaseDates?.results.find((r) => r.iso_3166_1 === 'US');
	if (!us) return undefined;
	const certified = us.release_dates.filter((d) => d.certification?.trim());
	const pick = certified.find((d) => d.type === 3) ?? certified[0];
	return pick?.certification ? MOVIE_CERTS[pick.certification.trim().toUpperCase()] : undefined;
}

const TV_RATINGS: Record<string, Maturity> = {
	'TV-Y': 'G',
	'TV-Y7': 'G',
	'TV-G': 'G',
	'TV-PG': 'PG',
	'TV-14': 'TV-14',
	'TV-MA': 'TV-MA'
};

export function tvMaturity(
	contentRatings: { results: { iso_3166_1: string; rating?: string | null }[] } | null | undefined
): Maturity | undefined {
	const us = contentRatings?.results.find((r) => r.iso_3166_1 === 'US' && r.rating?.trim());
	return us?.rating ? TV_RATINGS[us.rating.trim().toUpperCase()] : undefined;
}

export interface TrailerCandidate {
	key: string;
	site?: string | null;
	type?: string | null;
	official?: boolean | null;
	iso_639_1?: string | null;
}

const TRAILER_TYPE_SCORE: Record<string, number> = { trailer: 4, teaser: 2 };

/**
 * The YouTube video to show behind "Watch trailer": trailers over teasers,
 * official over fan uploads, English over other languages; TMDB lists newest
 * first, so ties keep that order. Other video types (featurettes, clips,
 * bloopers) and non-YouTube hosts are never picked.
 */
export function pickTrailer<T extends TrailerCandidate>(
	videos: T[] | null | undefined
): T | undefined {
	let best: { video: T; score: number } | undefined;
	for (const video of videos ?? []) {
		if (video.site?.toLowerCase() !== 'youtube' || !video.key) continue;
		const typeScore = TRAILER_TYPE_SCORE[video.type?.toLowerCase() ?? ''];
		if (!typeScore) continue;
		const score = typeScore * 4 + (video.official ? 2 : 0) + (video.iso_639_1 === 'en' ? 1 : 0);
		if (!best || score > best.score) best = { video, score };
	}
	return best?.video;
}

/** Diacritics-insensitive, punctuation-free key for comparing titles. */
export function normalizeTitle(title: string): string {
	return title
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function yearOf(date: string | null | undefined): number | undefined {
	const match = /^(\d{4})/.exec(date ?? '');
	return match ? Number(match[1]) : undefined;
}

export interface MatchCandidate {
	id: number;
	titles: (string | null | undefined)[];
	year?: number;
	popularity?: number | null;
}

/**
 * Score search results against the filename-derived title/year: an exact
 * normalized title is worth most, a prefix overlap less, a year within ±1
 * (release dates straddle new year across regions) is a bonus on top, and
 * popularity only breaks ties. The title must match — a year alone proves
 * nothing, and the ingest year is often just the file's mtime (better an
 * empty poster than the wrong one).
 */
export function pickBestMatch<T extends MatchCandidate>(
	candidates: T[],
	title: string,
	year?: number
): T | undefined {
	const wanted = normalizeTitle(title);
	if (!wanted) return undefined;
	let best: { candidate: T; score: number } | undefined;
	for (const candidate of candidates) {
		// Non-Latin original titles normalize to '' — and '' is a prefix of everything.
		const names = candidate.titles
			.filter((t): t is string => Boolean(t))
			.map(normalizeTitle)
			.filter(Boolean);
		let score = 0;
		if (names.includes(wanted)) score += 2;
		else if (names.some((n) => n.startsWith(wanted) || wanted.startsWith(n))) score += 1;
		if (score === 0) continue;
		if (
			year !== undefined &&
			candidate.year !== undefined &&
			Math.abs(candidate.year - year) <= 1
		) {
			score += 1;
		}
		if (
			!best ||
			score > best.score ||
			(score === best.score && (candidate.popularity ?? 0) > (best.candidate.popularity ?? 0))
		) {
			best = { candidate, score };
		}
	}
	return best?.candidate;
}

/**
 * The filename-derived title, recovered from the slug (the ingest key, which
 * enrichment never rewrites). A forced refresh re-searches from this rather
 * than the stored title, which a previous wrong match may have overwritten.
 * Movie slugs end in the scan year when one was parsed; only a plausible
 * release-year tail is dropped ("blade-runner-2049" keeps its 2049) and never
 * the whole slug.
 */
export function scanTitleFromSlug(slug: string, kind: 'movie' | 'series'): string {
	const words = slug.split('-').filter(Boolean);
	if (kind === 'movie' && words.length > 1) {
		const tail = Number(words.at(-1));
		if (/^\d{4}$/.test(words.at(-1)!) && tail >= 1888 && tail <= new Date().getFullYear() + 2) {
			words.pop();
		}
	}
	return words.join(' ');
}

// ---------- networks / studios ----------

export interface StudioBrand {
	slug: string;
	name: string;
}

/**
 * Lowercase, accent-free, `&` → "and", punctuation → spaces — but `+` survives,
 * so "Disney+" and "Disney" stay different brands.
 */
function brandKey(name: string): string {
	return name
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9+]+/g, ' ')
		.trim();
}

/**
 * Streaming brands whose TV networks and production companies go by several
 * names on TMDB. Everything listed under one entry becomes one category tile.
 */
const BRANDS: { slug: string; name: string; aliases: string[] }[] = [
	{
		slug: 'netflix',
		name: 'Netflix',
		aliases: ['netflix', 'netflix animation', 'netflix studios']
	},
	{
		slug: 'hbo',
		name: 'HBO',
		aliases: [
			'hbo',
			'hbo max',
			'max',
			'max originals',
			'hbo films',
			'hbo documentary films',
			'hbo entertainment',
			'hbo originals',
			'home box office',
			'home box office hbo'
		]
	},
	{
		slug: 'apple-tv',
		name: 'Apple TV+',
		aliases: ['apple tv+', 'apple tv', 'apple studios', 'apple original films']
	},
	{
		slug: 'prime-video',
		name: 'Prime Video',
		aliases: [
			'prime video',
			'amazon',
			'amazon prime video',
			'amazon studios',
			'amazon mgm studios',
			'amazon content services'
		]
	},
	{ slug: 'disney-plus', name: 'Disney+', aliases: ['disney+'] },
	{ slug: 'hulu', name: 'Hulu', aliases: ['hulu', 'hulu originals'] },
	{
		slug: 'paramount-plus',
		name: 'Paramount+',
		aliases: ['paramount+', 'paramount+ with showtime']
	},
	{ slug: 'peacock', name: 'Peacock', aliases: ['peacock', 'peacock original'] },
	{ slug: 'showtime', name: 'Showtime', aliases: ['showtime', 'showtime networks'] },
	{ slug: 'fx', name: 'FX', aliases: ['fx', 'fx productions', 'fx networks'] },
	{ slug: 'amc', name: 'AMC', aliases: ['amc', 'amc studios'] },
	{
		slug: 'bbc',
		name: 'BBC',
		aliases: ['bbc', 'bbc one', 'bbc two', 'bbc three', 'bbc four', 'bbc iplayer', 'bbc film']
	}
];

const BRAND_BY_ALIAS = new Map(
	BRANDS.flatMap((b) => b.aliases.map((alias) => [alias, { slug: b.slug, name: b.name }] as const))
);

/**
 * The category a TMDB network / production company belongs to: a known
 * streaming brand, or the company under its own name.
 */
export function studioBrand(name: string): StudioBrand {
	const trimmed = name.trim();
	return BRAND_BY_ALIAS.get(brandKey(trimmed)) ?? { slug: slugify(trimmed), name: trimmed };
}

/** True when `name` is the brand's own name (its logo beats a sub-label's). */
export function isCanonicalBrandName(name: string, brand: StudioBrand): boolean {
	return brandKey(name) === brandKey(brand.name);
}

/** De-duplicated brands for a title's networks / companies, in TMDB order. */
export function studioBrands(names: Iterable<string>): StudioBrand[] {
	const seen = new Map<string, StudioBrand>();
	for (const name of names) {
		if (!name.trim()) continue;
		const brand = studioBrand(name);
		if (!seen.has(brand.slug)) seen.set(brand.slug, brand);
	}
	return [...seen.values()];
}

export function collectionSlug(name: string): string {
	return slugify(name);
}
