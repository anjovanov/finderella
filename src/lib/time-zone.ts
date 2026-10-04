import { invalidateAll } from '$app/navigation';

/**
 * Statistics bucket days and hours on the viewer's calendar: hand the server
 * this browser's zone (the `finderella_tz` cookie, read by `safeTimeZone`)
 * and reload once when it differs from the zone the load used. Call from
 * `onMount`; `path` scopes the cookie to the pages that read it.
 */
export function syncTimeZoneCookie(serverTz: string, path: string): void {
	const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	if (!zone || zone === serverTz) return;
	document.cookie = `finderella_tz=${encodeURIComponent(zone)}; path=${path}; max-age=31536000; samesite=lax`;
	void invalidateAll();
}
