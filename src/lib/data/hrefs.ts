import { resolve } from '$app/paths';
import type { MediaItem } from './types';

/**
 * Client-safe link builders. Kept separate from data access: components import
 * these directly, while catalog data now comes from server loads
 * (src/lib/server/catalog.ts).
 */

/** Link target for a media item's detail page. */
export function mediaHref(item: MediaItem): string {
	return item.kind === 'movie'
		? resolve('/movies/[id]', { id: item.id })
		: resolve('/series/[id]', { id: item.id });
}

/** Link target for playing a media item (series start at their first episode). */
export function watchHref(item: MediaItem): string {
	return item.kind === 'movie'
		? resolve('/movies/[id]/watch', { id: item.id })
		: episodeWatchHref(item.id, item.seasons[0].episodes[0].id);
}

/** Link target for playing a specific series episode. */
export function episodeWatchHref(seriesId: string, episodeId: string): string {
	return resolve('/series/[id]/watch/[episode]', { id: seriesId, episode: episodeId });
}
