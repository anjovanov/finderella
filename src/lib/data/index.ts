import type { Genre, MediaItem } from './types';

export * from './types';
export * from './hrefs';
export * from './episodes';
export * from './progress';

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
