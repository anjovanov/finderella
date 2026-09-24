/** "1h 2m 3s" / "15m 25s" / "25s" — elapsed units, for "Resume at …" (a clock-style
 *  "15:25" reads like a time of day to play at). */
export function formatDurationUnits(totalSeconds: number): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (sec > 0 || parts.length === 0) parts.push(`${sec}s`);
	return parts.join(' ');
}

/** "12h 5m" / "45m" / "0m" — watch-time totals (seconds dropped; days stay as hours). */
export function formatWatchTime(totalSeconds: number): string {
	const m = Math.max(0, Math.round(totalSeconds / 60));
	const h = Math.floor(m / 60);
	if (h === 0) return `${m}m`;
	return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

const RELATIVE_STEPS: [unit: Intl.RelativeTimeFormatUnit, seconds: number][] = [
	['year', 365 * 86_400],
	['month', 30 * 86_400],
	['week', 7 * 86_400],
	['day', 86_400],
	['hour', 3_600],
	['minute', 60]
];

/** "3 hours ago", "yesterday", "just now" (past times; future ones read "in …"). */
export function formatRelative(
	iso: string | Date,
	now: number = Date.now(),
	locale?: string
): string {
	const diff = (new Date(iso).getTime() - now) / 1000;
	const abs = Math.abs(diff);
	if (abs < 45) return 'just now';
	const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	for (const [unit, seconds] of RELATIVE_STEPS) {
		if (abs >= seconds) return format.format(Math.round(diff / seconds), unit);
	}
	return format.format(Math.round(diff / 60), 'minute');
}
