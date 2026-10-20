import { currentLocale } from './locale';

type Duration = { hours?: number; minutes?: number; seconds?: number };

/**
 * Narrow units in the viewer's language ("1h 2m 3s"; Spanish "1h 2min 3s").
 * Zero units are left out; `zero` is the one printed when all of them are.
 * Built by hand rather than with Intl.DurationFormat, which older browsers and
 * TV engines lack (it throws there); the unit suffixes are catalog messages.
 */
export function formatUnits(duration: Duration, zero: 'minutes' | 'seconds'): string {
	const { hours = 0, minutes = 0, seconds = 0 } = duration;
	const parts: string[] = [];
	if (hours > 0) parts.push(/* @wc-include */ `${hours}h`);
	if (minutes > 0 || (zero === 'minutes' && parts.length === 0))
		parts.push(/* @wc-include */ `${minutes}m`);
	if (seconds > 0 || (zero === 'seconds' && parts.length === 0))
		parts.push(/* @wc-include */ `${seconds}s`);
	return parts.join(' ');
}

/** "1h 2m 3s" / "15m 25s" / "25s" — elapsed units, for "Resume at …" (a clock-style
 *  "15:25" reads like a time of day to play at). */
export function formatDurationUnits(totalSeconds: number): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	return formatUnits(
		{ hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 },
		'seconds'
	);
}

/** "12h 5m" / "45m" / "0m" — watch-time totals (seconds dropped; days stay as hours). */
export function formatWatchTime(totalSeconds: number): string {
	const m = Math.max(0, Math.round(totalSeconds / 60));
	return formatUnits({ hours: Math.floor(m / 60), minutes: m % 60 }, 'minutes');
}

const RELATIVE_STEPS: [unit: Intl.RelativeTimeFormatUnit, seconds: number][] = [
	['year', 365 * 86_400],
	['month', 30 * 86_400],
	['week', 7 * 86_400],
	['day', 86_400],
	['hour', 3_600],
	['minute', 60]
];

// One formatter per language: lists (activity log, history) format a time per row.
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
function relativeFormat(locale: string): Intl.RelativeTimeFormat {
	let format = relativeFormats.get(locale);
	if (!format) {
		format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		relativeFormats.set(locale, format);
	}
	return format;
}

/**
 * "3 hours ago", "yesterday", "just now" (past times; future ones read "in …"),
 * lower-case so it also reads mid-sentence ("Last used just now").
 */
export function formatRelative(
	iso: string | Date,
	now: number = Date.now(),
	locale?: string
): string {
	const diff = (new Date(iso).getTime() - now) / 1000;
	const abs = Math.abs(diff);
	if (abs < 45) return /* @wc-include */ 'just now';
	// The default stays in the body: wuchale rewrites `currentLocale()` only there.
	const format = relativeFormat(locale ?? currentLocale());
	for (const [unit, seconds] of RELATIVE_STEPS) {
		if (abs >= seconds) return format.format(Math.round(diff / seconds), unit);
	}
	return format.format(Math.round(diff / 60), 'minute');
}
