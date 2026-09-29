/**
 * Intro / credits markers as the player sees them (client-safe). Times are
 * seconds on the source timeline — the same as `video.currentTime` for both
 * direct play and HLS (the hub synthesizes the full VOD playlist).
 */

export const SKIP_MODES = ['show', 'auto', 'off'] as const;
export type SkipMode = (typeof SKIP_MODES)[number];

export const SKIP_MODE_LABELS: Record<SkipMode, string> = {
	show: 'Show a skip button',
	auto: 'Skip automatically',
	off: 'Off'
};

export function isSkipMode(value: unknown): value is SkipMode {
	return (SKIP_MODES as readonly unknown[]).includes(value);
}

export type MarkerKind = 'intro' | 'credits';

export interface MarkerSpan {
	start: number;
	end: number;
	/** Confident enough to act on without the viewer (chapter or fingerprint match). */
	autoSkip: boolean;
}

export interface CreditsSpan extends MarkerSpan {
	/** Nothing but the credits follows — skipping them finishes the title. */
	toEnd: boolean;
}

export interface PlaybackMarkers {
	intro: MarkerSpan | null;
	credits: CreditsSpan | null;
}

export type ActiveMarker =
	{ kind: 'intro'; span: MarkerSpan } | { kind: 'credits'; span: CreditsSpan };

/** Seconds before the intro's end at which its button goes away (the jump would be pointless). */
const INTRO_TAIL = 1;

/** The marker the playhead is inside, if any. */
export function activeMarker(t: number, markers: PlaybackMarkers | null): ActiveMarker | null {
	if (!markers || !Number.isFinite(t)) return null;
	const { intro, credits } = markers;
	if (intro && t >= intro.start && t < intro.end - INTRO_TAIL)
		return { kind: 'intro', span: intro };
	if (credits && t >= credits.start && t < credits.end) return { kind: 'credits', span: credits };
	return null;
}

/** Largest timeupdate step still counted as continuous playback (not a seek). */
const MAX_PLAYBACK_STEP = 2;

/**
 * Did playback run into the marker (as opposed to the viewer seeking into
 * it)? `prevT` is null for the first time report of a session — a session
 * that starts at (or just before) the marker counts as running into it.
 */
export function enteredByPlayback(prevT: number | null, t: number, span: MarkerSpan): boolean {
	if (t < span.start || t >= span.end) return false;
	if (prevT === null) return t <= span.start + MAX_PLAYBACK_STEP;
	const step = t - prevT;
	return prevT < span.start && step > 0 && step <= MAX_PLAYBACK_STEP;
}

/** Where skipping lands: the marker's end, or just before the end of the file for closing credits. */
export function skipTarget(span: MarkerSpan & { toEnd?: boolean }, duration: number): number {
	if (span.toEnd && Number.isFinite(duration) && duration > 0) {
		return Math.max(span.start, duration - 0.5);
	}
	return span.end;
}

/** Length of the "Next episode" countdown that starts with the closing credits. */
export const CREDITS_COUNTDOWN_SECONDS = 10;

/**
 * Seconds left on the "Next episode" countdown, or null outside the credits.
 * It runs from `since` — where the viewer reached the credits (their start
 * during playback; a seek into the middle restarts the full countdown) —
 * and never outlasts the credits themselves.
 */
export function creditsCountdown(
	t: number,
	credits: CreditsSpan,
	since: number,
	seconds = CREDITS_COUNTDOWN_SECONDS
): number | null {
	if (t < credits.start || t >= credits.end) return null;
	const from = Math.min(Math.max(since, credits.start), t);
	return Math.max(0, Math.min(seconds - (t - from), credits.end - t));
}

/** Seconds a skip button stays up after its marker starts, even while the controls are hidden. */
export const SKIP_BUTTON_GRACE = 8;

export function skipButtonVisible(t: number, span: MarkerSpan, chromeVisible: boolean): boolean {
	return chromeVisible || t < span.start + SKIP_BUTTON_GRACE;
}
