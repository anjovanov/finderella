import { browser } from '$app/environment';
import { loadLocale } from 'wuchale/load-utils';
import type { LayoutLoad } from './$types';

// Registers the client catalog loaders (needed once, before loadLocale).
import '../locales/main.loader.svelte.js';
import '../locales/js.loader.js';

/**
 * Loads the UI language's catalogs before any page renders on the client
 * (the server loads them all at startup in hooks.server.ts, which also picks
 * the locale). Re-runs with the root server load, so saving another language
 * in the preferences switches the UI in place. Passes the server data through:
 * a universal load's return replaces it.
 */
// The locale whose catalogs are loaded in this tab. Browser-only (the server
// never touches it), so nothing is shared between requests.
let loadedLocale: string | null = null;

export const load: LayoutLoad = async ({ data }) => {
	// Every invalidateAll re-runs this; reloading the same catalogs would swap in
	// new runtimes and re-render every message on the page for nothing.
	if (browser && data.locale !== loadedLocale) {
		await loadLocale(data.locale);
		loadedLocale = data.locale;
	}
	return data;
};
