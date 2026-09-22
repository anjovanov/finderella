import { json, type RequestHandler } from '@sveltejs/kit';
import { screensaverArtwork } from '$lib/server/catalog';

/**
 * Backdrops for the screensaver slideshow (fetched once per tab, on first
 * activation). Access follows the hook: open in guest mode, 401 otherwise.
 */
export const GET: RequestHandler = async () => {
	return json(await screensaverArtwork(), { headers: { 'cache-control': 'private, max-age=300' } });
};
