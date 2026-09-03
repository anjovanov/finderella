/**
 * Filename/path → catalog metadata parsing (v1, no external metadata source).
 * Pure module: unit-tested directly, no SvelteKit imports.
 *
 * Conventions handled:
 *   movies:  "Title (2019).mkv", "Title.2019.1080p.x264.mkv", "Title (2019)/Title (2019).mkv",
 *            "Title (2019)/anything.mkv" (folder supplies title + year when the file has none)
 *   series:  "Show Name/Season 01/S01E02 - Episode Title.mkv", bare "Show.S01E02.mkv",
 *            "Show Name/1x02 Episode Title.mkv", "Show S01E02 - Title/anything.mkv"
 *            (the episode marker may live on a folder when the file has none)
 */

export interface ParsedMovie {
	title: string;
	year?: number;
}

export interface ParsedEpisode {
	showTitle: string;
	season: number;
	episode: number;
	episodeTitle?: string;
	year?: number;
}

/** Tokens that mark the start of release junk we cut away from titles. */
const JUNK_TOKENS =
	/\b(2160p|1080p|720p|480p|bluray|blu-ray|webrip|web-dl|webdl|web|hdtv|dvdrip|brrip|x264|x265|h264|h265|hevc|av1|aac|ac3|dts|hdr|hdr10|dv|remux|proper|repack|extended|unrated|multi|vostfr)\b.*$/i;

/** "(2017)" / "[2017]" — nobody brackets a year that is part of the title. */
const BRACKET_YEAR_RE = /[([]\s*((?:18|19|20)\d{2})\s*[)\]]/;
/** A bare year token; the lookarounds keep "2160p" and "x2649" from qualifying. */
const YEAR_TOKEN_RE = /(?<![0-9a-z])((?:18|19|20)\d{2})(?![0-9a-z])/gi;
/**
 * Season-pack markers in show folder names ("Show S01 S02 S03 Complete …",
 * "Show Season 1-3", "Show Complete Series"). Only applied to show titles —
 * "Season"/"Complete" can be legitimate words in movie titles.
 */
const SEASON_PACK_RE = /\b(?:s\d{1,2}|seasons?|complete)\b/i;
const EPISODE_RE = /\bs(\d{1,2})[\s._-]*e(\d{1,3})\b|\b(\d{1,2})x(\d{2,3})\b/i;

/** Sample clips shipped inside release folders are at most a few minutes long. */
const SAMPLE_MAX_MS = 10 * 60_000;

function stripExtension(name: string): string {
	return name.replace(/\.[a-z0-9]{2,4}$/i, '');
}

/** Index where the release junk starts (text length when there is none). */
function junkStart(text: string): number {
	// Dots/underscores are word separators in release names; same length, so
	// the index maps back 1:1.
	const match = JUNK_TOKENS.exec(text.replace(/[._]/g, ' '));
	return match ? match.index : text.length;
}

function cleanTitle(raw: string): string {
	return (
		raw
			.replace(/[._]/g, ' ')
			.replace(JUNK_TOKENS, '')
			// Junk cut mid-bracket leaves "Title (" behind: drop empty pairs and
			// unbalanced trailing openers / leading closers.
			.replace(/[([{]\s*[)\]}]/g, '')
			.replace(/[-\s([{]+$/g, '')
			.replace(/^[-\s)\]}]+/g, '')
			.replace(/\s{2,}/g, ' ')
			.trim()
	);
}

/**
 * A release year has to be one: nothing before cinema, nothing beyond next
 * year (a title labelled 2027 in late 2026 is fine; "Blade Runner 2049" is not
 * from 2049).
 */
function plausibleYear(year: number): boolean {
	return year >= 1888 && year <= new Date().getFullYear() + 1;
}

interface YearHit {
	year: number;
	index: number;
}

/**
 * The release year in a name segment: a bracketed year wins; otherwise the
 * last plausible bare year before the release junk ("Blade.Runner.2049.2017"
 * → 2017, keeping 2049 in the title), and failing that anywhere in the text.
 */
function pickYear(text: string): YearHit | undefined {
	const head = text.slice(0, junkStart(text));
	const bracket = BRACKET_YEAR_RE.exec(head);
	if (bracket && plausibleYear(Number(bracket[1]))) {
		return { year: Number(bracket[1]), index: bracket.index };
	}
	for (const candidate of [head, text]) {
		let last: YearHit | undefined;
		for (const match of candidate.matchAll(YEAR_TOKEN_RE)) {
			const year = Number(match[1]);
			if (plausibleYear(year)) last = { year, index: match.index };
		}
		if (last) return last;
	}
	return undefined;
}

export function slugify(text: string): string {
	return (
		text
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'untitled'
	);
}

/** Deterministic gradient hues from a slug — same trick as the mock PosterArt data. */
export function themeFromSlug(slug: string): { hue: number; hue2: number } {
	let hash = 0;
	for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return { hue: hash % 360, hue2: (hash * 7 + 137) % 360 };
}

function parseMovieSegment(segment: string): ParsedMovie {
	const hit = pickYear(segment);
	if (hit) {
		const title = cleanTitle(segment.slice(0, hit.index));
		if (title) return { title, year: hit.year };
	}
	return { title: cleanTitle(segment) || segment };
}

/**
 * The filename decides when it carries a year; otherwise the nearest folder
 * that does ("Inception (2010)/movie.mkv"). With no year anywhere the filename
 * title stands ("Christopher Nolan/Inception.mkv" is still "Inception").
 */
export function parseMoviePath(relPath: string): ParsedMovie {
	const parts = relPath.split('/');
	const fromFile = parseMovieSegment(stripExtension(parts.at(-1) ?? relPath));
	if (fromFile.year !== undefined) return fromFile;
	for (let i = parts.length - 2; i >= 0; i--) {
		const fromFolder = parseMovieSegment(parts[i]);
		if (fromFolder.year !== undefined) return fromFolder;
	}
	return fromFile;
}

export function parseEpisodePath(relPath: string): ParsedEpisode | null {
	const parts = relPath.split('/');
	const basename = stripExtension(parts.at(-1) ?? relPath);

	// The SxxEyy marker normally sits on the file; per-episode release folders
	// ("Show S01E04 - Title/video.mkv") carry it on the nearest folder instead.
	let markerSegment = basename;
	let markerIndex = parts.length - 1;
	let match = EPISODE_RE.exec(basename);
	for (let i = parts.length - 2; i >= 0 && !match; i--) {
		match = EPISODE_RE.exec(parts[i]);
		if (match) {
			markerSegment = parts[i];
			markerIndex = i;
		}
	}
	if (!match) return null;

	const season = Number(match[1] ?? match[3]);
	const episode = Number(match[2] ?? match[4]);
	if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;

	// Show title: prefer the top-level folder ("Show Name/Season 01/…"),
	// falling back to whatever precedes the marker in the marker segment.
	const prefix = markerSegment.slice(0, match.index);
	let showRaw = markerIndex > 0 ? parts[0] : prefix;
	let year: number | undefined;
	let cutAt = showRaw.length;
	const showYear = pickYear(showRaw);
	if (showYear) {
		year = showYear.year;
		cutAt = Math.min(cutAt, showYear.index);
	}
	// Cut season-pack markers too, but never at index 0 ("Complete Savages").
	const seasonPack = SEASON_PACK_RE.exec(showRaw);
	if (seasonPack && seasonPack.index > 0) cutAt = Math.min(cutAt, seasonPack.index);
	// Single-episode release folders carry the full marker
	// ("Show S12E02 Title 1080p WEB-DL…/Show S12E02 ….mkv").
	const folderMarker = EPISODE_RE.exec(showRaw);
	if (folderMarker && folderMarker.index > 0) cutAt = Math.min(cutAt, folderMarker.index);
	showRaw = showRaw.slice(0, cutAt);
	const showTitle = cleanTitle(showRaw);
	if (!showTitle) return null;

	// Year not on the show folder: try the text before the marker
	// ("Show.2021.S04E01…"). Never after it — episode titles contain numbers.
	if (year === undefined && markerIndex > 0) year = pickYear(prefix)?.year;

	const afterMarker = markerSegment.slice(match.index + match[0].length);
	const episodeTitle = cleanTitle(afterMarker) || undefined;

	return { showTitle, season, episode, episodeTitle, year };
}

/**
 * Sample clips inside release folders ("Sample/sample.mkv", "movie-sample.mkv").
 * Needs both signals — a name that says sample *and* a short (or unknown)
 * duration — so a feature-length title that happens to be called "Sample"
 * is kept.
 */
export function isSampleFile(relPath: string, durationMs?: number): boolean {
	if (durationMs !== undefined && durationMs >= SAMPLE_MAX_MS) return false;
	const parts = relPath.toLowerCase().split('/');
	const folders = parts.slice(0, -1);
	if (folders.some((f) => f === 'sample' || f === 'samples')) return true;
	const stem = cleanTitle(stripExtension(parts.at(-1) ?? ''));
	return stem === 'sample' || /[\s-]sample$/.test(stem);
}
