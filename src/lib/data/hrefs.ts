import { resolve } from '$app/paths';
import type { CategoryType } from './categories';
import { playTarget } from './episodes';
import type { MediaItem } from './types';

/**
 * Client-safe link builders. Kept separate from data access: components import
 * these directly, while catalog data now comes from server loads
 * (src/lib/server/catalog.ts).
 */

/**
 * Link target for a media item's detail page. Accepts anything carrying
 * `kind` + `id` (a lightweight `SearchResult` links the same way).
 */
export function mediaHref(item: Pick<MediaItem, 'kind' | 'id'>): string {
	return item.kind === 'movie'
		? resolve('/movies/[id]', { id: item.id })
		: resolve('/series/[id]', { id: item.id });
}

/**
 * Link target for playing a media item. Series go to the viewer's next-in-line
 * episode (see `playTarget`); a series with no episodes falls back to its detail page.
 */
export function watchHref(item: MediaItem): string {
	if (item.kind === 'movie') return resolve('/movies/[id]/watch', { id: item.id });
	const target = playTarget(item);
	return target ? episodeWatchHref(item.id, target.episode.id) : mediaHref(item);
}

/** Link target for playing a specific series episode. */
export function episodeWatchHref(seriesId: string, episodeId: string): string {
	return resolve('/series/[id]/watch/[episode]', { id: seriesId, episode: episodeId });
}

/** Link target for a browse category (/categories/genres/sci-fi, /categories/networks/hbo…). */
export function categoryHref(type: CategoryType, slug: string): string {
	return resolve('/categories/[type=category]/[slug]', { type, slug });
}

/** A watch party's shareable join link (path; the invite UI prefixes the origin). */
export function togetherHref(code: string): string {
	return resolve('/together/[code]', { code });
}
