import type { CreditsSpan, MarkerKind, MarkerSpan, PlaybackMarkers } from '$lib/data/markers';
import type { MarkerSource } from './types';

export interface MarkerRow {
	kind: MarkerKind;
	source: MarkerSource;
	startMs: number;
	endMs: number;
	confidence: number;
}

const PRIORITY: Record<MarkerSource, number> = { chapter: 0, fingerprint: 1, darkframes: 2 };
/** Shorter than this isn't worth a button. */
const MIN_SPAN_MS = 5000;
/** Credits ending this close to the end of the file run to the end (logos, a blank tail). */
const TO_END_MS = 15_000;
/** A dark-frame run touching a fingerprint match this closely is the same credits. */
const JOIN_MS = 5000;
/**
 * …but it only moves the fingerprint's edge when it reaches this much further:
 * dark frames are keyframe samples (seconds apart), so a smaller difference is
 * sampling error, and the fingerprint's edge is the precise one.
 */
const MIN_EXTEND_MS = 15_000;
const AUTO_SKIP_MIN_CONFIDENCE = 0.5;

function valid(row: MarkerRow, durationMs: number | null): boolean {
	const end = durationMs ? Math.min(row.endMs, durationMs) : row.endMs;
	return row.startMs >= 0 && end - row.startMs >= MIN_SPAN_MS;
}

function pick(rows: MarkerRow[], kind: MarkerKind, durationMs: number | null): MarkerRow[] {
	return rows
		.filter((r) => r.kind === kind && valid(r, durationMs))
		.sort((x, y) => PRIORITY[x.source] - PRIORITY[y.source]);
}

function span(row: MarkerRow, startMs: number, endMs: number): MarkerSpan {
	return {
		start: startMs / 1000,
		end: endMs / 1000,
		autoSkip: row.source !== 'darkframes' && row.confidence >= AUTO_SKIP_MIN_CONFIDENCE
	};
}

/**
 * What the player gets for a file: per kind the most trusted source (a
 * labelled chapter, then a season-wide fingerprint match, then dark frames).
 * A fingerprint match on the ending theme often covers only part of the
 * credits roll; an adjoining dark-frame run extends it.
 */
export function resolveMarkers(
	rows: readonly MarkerRow[],
	durationMs: number | null
): PlaybackMarkers | null {
	const all = [...rows];
	const introRow = pick(all, 'intro', durationMs)[0];
	const intro = introRow
		? span(
				introRow,
				introRow.startMs,
				durationMs ? Math.min(introRow.endMs, durationMs) : introRow.endMs
			)
		: null;

	const creditRows = pick(all, 'credits', durationMs);
	let credits: CreditsSpan | null = null;
	const best = creditRows[0];
	if (best) {
		let startMs = best.startMs;
		let endMs = durationMs ? Math.min(best.endMs, durationMs) : best.endMs;
		const dark = creditRows.find((r) => r.source === 'darkframes');
		if (
			best.source === 'fingerprint' &&
			dark &&
			dark.startMs <= endMs + JOIN_MS &&
			dark.endMs >= startMs - JOIN_MS
		) {
			if (dark.startMs < startMs - MIN_EXTEND_MS) startMs = dark.startMs;
			const darkEnd = durationMs ? Math.min(dark.endMs, durationMs) : dark.endMs;
			if (darkEnd > endMs + MIN_EXTEND_MS) endMs = darkEnd;
		}
		const toEnd = durationMs !== null && durationMs - endMs <= TO_END_MS;
		if (toEnd) endMs = durationMs;
		credits = { ...span(best, startMs, endMs), toEnd };
	}

	// An intro can't overlap the credits (a very short file): keep the credits.
	const introOk = intro && (!credits || intro.end <= credits.start) ? intro : null;
	if (!introOk && !credits) return null;
	return { intro: introOk, credits };
}
