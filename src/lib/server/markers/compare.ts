/**
 * Finds the longest stretch of audio two fingerprints share — the intro (or
 * ending theme) two episodes of a season have in common, wherever it sits in
 * each of them.
 *
 * 1. Candidate alignments: every (near-)exact value match votes for the
 *    offset between its positions in the two fingerprints (an inverted index
 *    of `b`, probed with each value of `a` and its 32 one-bit neighbours).
 * 2. Per candidate offset, the per-frame Hamming distance is smoothed and
 *    thresholded; the longest run of matching frames (short gaps bridged)
 *    within the duration bounds wins.
 *
 * A fingerprint value of 0 means "no information" (silence): it never votes
 * and always counts as a mismatch, so shared silence can't pose as an intro.
 */

export interface CompareOptions {
	/** Milliseconds between fingerprint values. */
	hopMs: number;
	/** Shortest shared stretch that counts. */
	minMs: number;
	/** Longest — anything longer isn't an intro/credits (e.g. identical files). */
	maxMs: number;
}

export interface SharedSegment {
	/** Offsets from the start of each fingerprint, in ms. */
	aStartMs: number;
	aEndMs: number;
	bStartMs: number;
	bEndMs: number;
	/** Mean bit error rate over the segment (0 = identical). */
	ber: number;
}

/** Values more common than this in `b` are noise (steady tones, near-silence) and don't vote. */
const MAX_VALUE_OCCURRENCES = 8;
/** Candidate offsets examined per pair. */
const MAX_CANDIDATES = 4;
/** Votes an offset needs (after ±1 smoothing) to be examined. */
const MIN_VOTES = 6;
/** Offsets closer than this to a stronger candidate are the same alignment. */
const CANDIDATE_SPACING = 4;
/** Frames in the moving average (about 0.7 s at a 46 ms hop). */
const SMOOTH_FRAMES = 15;
/** Smoothed bit difference (of 32) at or below which frames match — a BER of about 0.31. */
const MATCH_MAX_BITS = 10;
/** Non-matching gaps bridged inside one segment. */
const MAX_GAP_MS = 2500;

export function popcount32(x: number): number {
	x = x - ((x >>> 1) & 0x55555555);
	x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
	x = (x + (x >>> 4)) & 0x0f0f0f0f;
	return Math.imul(x, 0x01010101) >>> 24;
}

/** Offsets (b index − a index) worth examining, strongest first. */
export function candidateOffsets(a: Uint32Array, b: Uint32Array): number[] {
	const positions = new Map<number, number[]>();
	for (let j = 0; j < b.length; j++) {
		const v = b[j];
		if (v === 0) continue;
		const list = positions.get(v);
		if (list) list.push(j);
		else positions.set(v, [j]);
	}
	for (const [value, list] of positions) {
		if (list.length > MAX_VALUE_OCCURRENCES) positions.delete(value);
	}

	const votes = new Map<number, number>();
	const vote = (i: number, value: number) => {
		const list = positions.get(value);
		if (!list) return;
		for (const j of list) votes.set(j - i, (votes.get(j - i) ?? 0) + 1);
	};
	for (let i = 0; i < a.length; i++) {
		const v = a[i];
		if (v === 0) continue;
		vote(i, v);
		for (let bit = 0; bit < 32; bit++) vote(i, (v ^ (1 << bit)) >>> 0);
	}

	const scored: Array<[offset: number, votes: number]> = [];
	for (const offset of votes.keys()) {
		const total =
			(votes.get(offset - 1) ?? 0) + (votes.get(offset) ?? 0) + (votes.get(offset + 1) ?? 0);
		if (total >= MIN_VOTES) scored.push([offset, total]);
	}
	scored.sort((x, y) => y[1] - x[1] || x[0] - y[0]);

	const picked: number[] = [];
	for (const [offset] of scored) {
		if (picked.some((p) => Math.abs(p - offset) < CANDIDATE_SPACING)) continue;
		picked.push(offset);
		if (picked.length >= MAX_CANDIDATES) break;
	}
	return picked;
}

interface Run {
	start: number;
	end: number;
	bits: number;
}

/** Longest bridged run of matching frames of `a` aligned with `b` at `offset`, within bounds. */
function bestRunAt(
	a: Uint32Array,
	b: Uint32Array,
	offset: number,
	minFrames: number,
	maxFrames: number,
	gapFrames: number
): Run | null {
	const from = Math.max(0, -offset);
	const to = Math.min(a.length, b.length - offset);
	const length = to - from;
	if (length < minFrames) return null;

	const dist = new Uint8Array(length);
	for (let k = 0; k < length; k++) {
		const x = a[from + k];
		const y = b[from + k + offset];
		dist[k] = x === 0 || y === 0 ? 32 : popcount32((x ^ y) >>> 0);
	}

	// Centered moving average of the distance.
	const half = SMOOTH_FRAMES >> 1;
	const prefix = new Float64Array(length + 1);
	for (let k = 0; k < length; k++) prefix[k + 1] = prefix[k] + dist[k];
	const matches = (k: number) => {
		const lo = Math.max(0, k - half);
		const hi = Math.min(length, k + half + 1);
		return (prefix[hi] - prefix[lo]) / (hi - lo) <= MATCH_MAX_BITS;
	};

	let best: Run | null = null;
	let runStart = -1;
	let lastMatch = -1;
	const close = () => {
		if (runStart < 0) return;
		const frames = lastMatch - runStart + 1;
		if (frames >= minFrames && frames <= maxFrames && (!best || frames > best.end - best.start)) {
			best = {
				start: runStart,
				end: lastMatch + 1,
				bits: prefix[lastMatch + 1] - prefix[runStart]
			};
		}
		runStart = -1;
	};
	for (let k = 0; k < length; k++) {
		if (!matches(k)) continue;
		if (runStart >= 0 && k - lastMatch - 1 > gapFrames) close();
		if (runStart < 0) runStart = k;
		lastMatch = k;
	}
	close();

	const run = best as Run | null;
	return run ? { start: run.start + from, end: run.end + from, bits: run.bits } : null;
}

export function compareFingerprints(
	a: Uint32Array,
	b: Uint32Array,
	opts: CompareOptions
): SharedSegment | null {
	const minFrames = Math.ceil(opts.minMs / opts.hopMs);
	const maxFrames = Math.floor(opts.maxMs / opts.hopMs);
	const gapFrames = Math.round(MAX_GAP_MS / opts.hopMs);

	let best: { run: Run; offset: number; score: number } | null = null;
	for (const offset of candidateOffsets(a, b)) {
		const run = bestRunAt(a, b, offset, minFrames, maxFrames, gapFrames);
		if (!run) continue;
		const frames = run.end - run.start;
		const ber = run.bits / (frames * 32);
		const score = frames * (1 - ber / 0.5);
		if (!best || score > best.score) best = { run, offset, score };
	}
	if (!best) return null;

	const { run, offset } = best;
	const frames = run.end - run.start;
	return {
		aStartMs: Math.round(run.start * opts.hopMs),
		aEndMs: Math.round(run.end * opts.hopMs),
		bStartMs: Math.round((run.start + offset) * opts.hopMs),
		bEndMs: Math.round((run.end + offset) * opts.hopMs),
		ber: run.bits / (frames * 32)
	};
}
