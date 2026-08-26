import type { Genre, MediaItem } from './types';

export * from './types';
export * from './hrefs';

// The mock titles remain only as the dev seed corpus (scripts/seed.ts) —
// pages read the catalog from the database via src/lib/server/catalog.ts.
export { movies } from './movies';
export { series } from './series';

/** Pure ranking/filtering helpers shared by page loads (DB rows in, rows out). */

export function topRated(items: MediaItem[], limit = 12): MediaItem[] {
	return items.toSorted((a, b) => b.rating - a.rating).slice(0, limit);
}

export function byGenre(genre: Genre, items: MediaItem[]): MediaItem[] {
	return items.filter((i) => i.genres.includes(genre));
}

export function allGenres(items: MediaItem[]): Genre[] {
	return [...new Set(items.flatMap((i) => i.genres))].sort();
}
