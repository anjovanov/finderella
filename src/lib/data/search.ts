import { resolve } from '$app/paths';
import type { Genre } from './types';

/**
 * Client-safe search contract. `GET /api/search` returns these; the navbar
 * dropdown renders them directly and links via `mediaHref` (which only needs
 * `kind` + `id`). `id` is the public slug, like every other frontend shape.
 */
export interface SearchResult {
	kind: 'movie' | 'series';
	id: string;
	title: string;
	year: number;
	posterUrl?: string;
	genres: Genre[];
	/** MiniSearch relevance score; larger is better. Only meaningful within one response. */
	score: number;
}

/** Link target for the full results page; the bare page when the query is empty. */
export function searchHref(query: string): string {
	const q = query.trim();
	const path = resolve('/search');
	return q ? `${path}?q=${encodeURIComponent(q)}` : path;
}
