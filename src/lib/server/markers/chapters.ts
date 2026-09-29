import type { ProbedChapter } from '@finderella/protocol';
import type { DetectedMarker } from './types';

/**
 * Chapter titles that name an intro or the closing credits. Whole-title
 * matches only: "Opening Night" or "The Credits Roll" are story chapters.
 */
const INTRO_TITLE =
	/^(intro(duction)?|opening|op\s*\d*|opening (credits|theme|titles|sequence)|title sequence|main titles?|theme song)$/i;
const CREDITS_TITLE =
	/^(credits|end(ing)? credits|closing (credits|titles)|ending|ed\s*\d*|outro|end titles?)$/i;

const INTRO_MIN_MS = 10_000;
const INTRO_MAX_MS = 4 * 60_000;
const CREDITS_MIN_MS = 10_000;

/** Intro/credits markers from container chapters (confidence 1 — someone labelled them). */
export function chapterMarkers(
	chapters: readonly ProbedChapter[],
	durationMs: number | null | undefined
): DetectedMarker[] {
	if (!durationMs || durationMs <= 0) return [];
	const out: DetectedMarker[] = [];

	const intro = chapters.find((c) => {
		const title = c.title?.trim();
		const length = c.endMs - c.startMs;
		return (
			title &&
			INTRO_TITLE.test(title) &&
			length >= INTRO_MIN_MS &&
			length <= INTRO_MAX_MS &&
			c.startMs <= durationMs * 0.4
		);
	});
	if (intro) {
		out.push({
			kind: 'intro',
			source: 'chapter',
			startMs: intro.startMs,
			endMs: Math.min(intro.endMs, durationMs),
			confidence: 1
		});
	}

	const credits = chapters.filter((c) => {
		const title = c.title?.trim();
		return (
			title &&
			CREDITS_TITLE.test(title) &&
			c.endMs - c.startMs >= CREDITS_MIN_MS &&
			c.startMs >= durationMs * 0.5
		);
	});
	const last = credits.at(-1);
	if (last && last.startMs < durationMs) {
		out.push({
			kind: 'credits',
			source: 'chapter',
			startMs: last.startMs,
			endMs: Math.min(last.endMs, durationMs),
			confidence: 1
		});
	}
	return out;
}
