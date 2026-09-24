/**
 * Time-zone and bucket helpers for the statistics queries (pure; tested).
 * Charts bucket by the *admin's* calendar day, so the browser zone travels
 * in a cookie (see /admin/statistics/+layout.svelte).
 */

export const TZ_COOKIE = 'finderella_tz';

/** An IANA zone the runtime (and therefore Postgres' tz database) knows, else UTC. */
export function safeTimeZone(value: string | null | undefined): string {
	if (!value || value.length > 64) return 'UTC';
	try {
		return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
	} catch {
		return 'UTC';
	}
}

/** Today's calendar date in `tz` as YYYY-MM-DD. */
export function todayIn(tz: string, now = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

/** The `days` calendar dates ending with `today` (inclusive), oldest first. */
export function dayRange(today: string, days: number): string[] {
	const [y, m, d] = today.split('-').map(Number);
	const end = Date.UTC(y, m - 1, d);
	return Array.from({ length: days }, (_, i) =>
		new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)
	);
}

/** One entry per day in `range`, with `empty` values where the query had no row. */
export function fillDays<T extends { day: string }>(
	rows: T[],
	range: string[],
	empty: (day: string) => T
): T[] {
	const byDay = new Map(rows.map((row) => [row.day, row]));
	return range.map((day) => byDay.get(day) ?? empty(day));
}

/** Postgres ISO day-of-week (1 = Monday) labels. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "00" … "23". */
export function hourLabel(hour: number): string {
	return String(hour).padStart(2, '0');
}
