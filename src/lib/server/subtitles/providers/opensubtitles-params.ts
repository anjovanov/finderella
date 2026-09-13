import { toOpenSubtitles } from '../languages';
import type { TitleQuery } from './types';

/**
 * OpenSubtitles caches by exact URL and answers non-canonical requests with a
 * redirect: parameters must be alphabetically sorted, lowercase, without
 * default values, and ids must carry no leading zeros. Pure so it's tested.
 */
export function buildOpenSubtitlesSearchParams(
	query: TitleQuery,
	language: string,
	opts: { excludeAi?: boolean } = {}
): URLSearchParams {
	const params: Record<string, string> = {};
	const languages = toOpenSubtitles(language).map((code) => code.toLowerCase());
	params.languages = [...new Set(languages)].sort().join(',');
	if (query.kind === 'movie') {
		params.type = 'movie';
		if (query.tmdbId) params.tmdb_id = String(query.tmdbId);
		else {
			params.query = query.title.toLowerCase();
			if (query.year) params.year = String(query.year);
		}
	} else {
		params.type = 'episode';
		if (query.season !== undefined) params.season_number = String(query.season);
		if (query.episode !== undefined) params.episode_number = String(query.episode);
		if (query.tmdbId) params.parent_tmdb_id = String(query.tmdbId);
		else params.query = query.title.toLowerCase();
	}
	if (query.movieHash) params.moviehash = query.movieHash.toLowerCase();
	if (opts.excludeAi) params.ai_translated = 'exclude';
	const sorted = new URLSearchParams();
	for (const key of Object.keys(params).sort()) sorted.set(key, params[key]);
	return sorted;
}
