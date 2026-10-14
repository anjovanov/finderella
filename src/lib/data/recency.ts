/** How long a title carries the "Just Added" label after it entered the library. */
export const JUST_ADDED_DAYS = 14;

/** How far back the home "New releases" row reaches (release / latest air date). */
export const NEW_RELEASE_MONTHS = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True while `addedAt` (ISO timestamp) is within the last JUST_ADDED_DAYS. */
export function isJustAdded(addedAt: string | undefined, now = Date.now()): boolean {
	if (!addedAt) return false;
	const added = Date.parse(addedAt);
	if (Number.isNaN(added)) return false;
	return now - added < JUST_ADDED_DAYS * DAY_MS;
}

/** `now` as a UTC calendar date (YYYY-MM-DD), the format of the release-date columns. */
export function isoDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/** Oldest release date (YYYY-MM-DD) that still counts as a new release. */
export function newReleaseCutoff(now: Date): string {
	const cutoff = new Date(now);
	cutoff.setUTCMonth(cutoff.getUTCMonth() - NEW_RELEASE_MONTHS);
	return isoDay(cutoff);
}
