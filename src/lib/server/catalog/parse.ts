/**
 * Filename/path → catalog metadata parsing (v1, no external metadata source).
 * Pure module: unit-tested directly, no SvelteKit imports.
 *
 * Conventions handled:
 *   movies:  "Title (2019).mkv", "Title.2019.1080p.x264.mkv", "Title (2019)/Title (2019).mkv"
 *   series:  "Show Name/Season 01/S01E02 - Episode Title.mkv", bare "Show.S01E02.mkv",
 *            "Show Name/1x02 Episode Title.mkv"
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

const YEAR_RE = /[([\s._-]((19|20)\d{2})[)\]\s._-]?/;
const EPISODE_RE = /\bs(\d{1,2})[\s._-]*e(\d{1,3})\b|\b(\d{1,2})x(\d{2,3})\b/i;

function stripExtension(name: string): string {
	return name.replace(/\.[a-z0-9]{2,4}$/i, '');
}

function cleanTitle(raw: string): string {
	return raw
		.replace(/[._]/g, ' ')
		.replace(JUNK_TOKENS, '')
		.replace(/[-\s]+$/g, '')
		.replace(/^[-\s]+/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
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

export function parseMoviePath(relPath: string): ParsedMovie {
	const basename = stripExtension(relPath.split('/').at(-1) ?? relPath);
	const yearMatch = YEAR_RE.exec(basename);
	if (yearMatch && typeof yearMatch.index === 'number') {
		const title = cleanTitle(basename.slice(0, yearMatch.index));
		if (title) return { title, year: Number(yearMatch[1]) };
	}
	return { title: cleanTitle(basename) || basename };
}

export function parseEpisodePath(relPath: string): ParsedEpisode | null {
	const parts = relPath.split('/');
	const basename = stripExtension(parts.at(-1) ?? relPath);
	const match = EPISODE_RE.exec(basename);
	if (!match) return null;

	const season = Number(match[1] ?? match[3]);
	const episode = Number(match[2] ?? match[4]);
	if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;

	// Show title: prefer the top-level folder ("Show Name/Season 01/…"),
	// falling back to whatever precedes the SxxEyy marker in the filename.
	let showRaw = parts.length > 1 ? parts[0] : basename.slice(0, match.index);
	let year: number | undefined;
	const showYear = YEAR_RE.exec(showRaw);
	if (showYear && typeof showYear.index === 'number') {
		year = Number(showYear[1]);
		showRaw = showRaw.slice(0, showYear.index);
	}
	const showTitle = cleanTitle(showRaw);
	if (!showTitle) return null;

	const afterMarker = basename.slice(match.index + match[0].length);
	const episodeTitle = cleanTitle(afterMarker) || undefined;

	return { showTitle, season, episode, episodeTitle, year };
}
