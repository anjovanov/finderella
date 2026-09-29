import type { DetectedMarker } from './types';

/**
 * Rolling credits sit on true black: the share of black pixels stays high
 * for minutes. This finds where that starts near the end of a file from the
 * gateway's keyframe samples, then follows the credits to the end of the
 * file unless a clearly bright stretch (a post-credits scene) interrupts.
 * It's a fallback (confidence 0.5, never auto-skipped): dense credits and
 * dark final scenes overlap a little, and credits over artwork go unseen.
 *
 * Sample values are the share (0..100) of pixels whose raw luma is ≤ 20
 * (video black is 16) — see the gateway's darkframeArgs. Measured on real
 * files (identical with ffmpeg 7 and 9): rolling credits 55–100 (dense credit
 * blocks lower, single names higher), night scenes 15–25, lit scenes near 0.
 * Letterboxing adds its bars' share to every frame of a scope film.
 */

export interface DarkframeSamples {
	timesMs: readonly number[];
	pblack: readonly number[];
}

/** A sample at or above this counts as a credits frame. */
const DARK_PBLACK = 55;
/** A run's dark samples must average at least this (night scenes hover lower). */
const MIN_MEAN_PBLACK = 65;
/** Dark samples further apart than this belong to different runs. */
const MAX_DARK_GAP_MS = 25_000;
/**
 * Lighter samples in a row a run may bridge: one is an isolated card or
 * logo inside the credits; more is a scene, and a dark frame before it
 * (a fade, a night shot) must not pull the credits' start forward.
 */
const MAX_BRIDGED_SAMPLES = 1;
/** Share of a run's samples that must be dark. */
const MIN_DARK_RATIO = 0.75;
const MIN_DARK_SAMPLES = 3;
/** Samples below this are a lit scene. */
const BRIGHT_PBLACK = 30;
/** A lit stretch at least this long after the credits is a post-credits scene. */
const MIN_BRIGHT_MS = 20_000;
/** Longest post-credits content allowed after the credits. */
const MAX_TAIL_MS = 5 * 60_000;

const RULES = {
	movie: { minMs: 60_000, minStartFraction: 0.75 },
	series: { minMs: 20_000, minStartFraction: 0.5 }
} as const;

interface Sample {
	t: number;
	p: number;
}

/** End of the credits that start with samples[from..]: the first lit stretch after `last`, else the end of the file. */
function creditsEnd(samples: Sample[], last: number, durationMs: number): number {
	let k = last + 1;
	while (k < samples.length) {
		if (samples[k].p >= BRIGHT_PBLACK) {
			k++;
			continue;
		}
		let m = k;
		while (m + 1 < samples.length && samples[m + 1].p < BRIGHT_PBLACK) m++;
		const stretchEnd = m + 1 < samples.length ? samples[m + 1].t : durationMs;
		if (stretchEnd - samples[k].t >= MIN_BRIGHT_MS) {
			return (samples[k - 1].t + samples[k].t) / 2;
		}
		k = m + 1;
	}
	return durationMs;
}

export function detectDarkCredits(
	input: DarkframeSamples,
	durationMs: number,
	kind: 'movie' | 'series'
): DetectedMarker | null {
	const count = Math.min(input.timesMs.length, input.pblack.length);
	if (count === 0 || !(durationMs > 0)) return null;
	const samples: Sample[] = Array.from({ length: count }, (_, i) => ({
		t: input.timesMs[i],
		p: input.pblack[i]
	})).sort((x, y) => x.t - y.t);
	const rules = RULES[kind];

	let best: { startMs: number; endMs: number; coreMs: number } | null = null;
	let i = 0;
	while (i < count) {
		if (samples[i].p < DARK_PBLACK) {
			i++;
			continue;
		}
		const first = i;
		let last = i;
		let darkSamples = 1;
		let darkSum = samples[i].p;
		for (let k = i + 1; k < count; k++) {
			if (samples[k].p < DARK_PBLACK) {
				if (k - last > MAX_BRIDGED_SAMPLES) break;
				continue;
			}
			if (samples[k].t - samples[last].t > MAX_DARK_GAP_MS) break;
			darkSamples++;
			darkSum += samples[k].p;
			last = k;
		}
		i = last + 1;

		// The run starts halfway from the previous (non-dark) sample.
		const startMs = first > 0 ? (samples[first - 1].t + samples[first].t) / 2 : samples[first].t;
		const coreEnd = last < count - 1 ? (samples[last].t + samples[last + 1].t) / 2 : durationMs;
		const coreMs = coreEnd - startMs;
		const qualifies =
			darkSamples >= MIN_DARK_SAMPLES &&
			darkSamples / (last - first + 1) >= MIN_DARK_RATIO &&
			darkSum / darkSamples >= MIN_MEAN_PBLACK &&
			coreMs >= rules.minMs &&
			startMs >= durationMs * rules.minStartFraction;
		if (!qualifies) continue;
		const endMs = creditsEnd(samples, last, durationMs);
		if (durationMs - endMs > MAX_TAIL_MS) continue;
		// The longest black-backed stretch is the credits roll.
		if (!best || coreMs > best.coreMs) best = { startMs, endMs, coreMs };
	}
	if (!best) return null;
	return {
		kind: 'credits',
		source: 'darkframes',
		startMs: Math.round(best.startMs),
		endMs: Math.round(Math.min(best.endMs, durationMs)),
		confidence: 0.5
	};
}
