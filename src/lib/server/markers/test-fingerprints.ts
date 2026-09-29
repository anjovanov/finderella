/** Synthetic fingerprints for the detection tests. */

export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function randomFingerprint(length: number, seed: number): Uint32Array {
	const rand = rng(seed);
	return Uint32Array.from({ length }, () => Math.floor(rand() * 0xffffffff) >>> 0 || 1);
}

/**
 * Copy `segment` into `target` at `at`, flipping each bit with probability
 * `flip` (re-encoded audio: most values survive exactly or nearly so).
 */
export function plant(
	target: Uint32Array,
	segment: Uint32Array,
	at: number,
	flip: number,
	seed: number
): Uint32Array {
	const rand = rng(seed);
	const out = target.slice();
	for (let i = 0; i < segment.length && at + i < out.length; i++) {
		let v = segment[i];
		for (let bit = 0; bit < 32; bit++) if (rand() < flip) v ^= 1 << bit;
		out[at + i] = v >>> 0 || 1;
	}
	return out;
}

export const HOP_MS = (256 / 5512) * 1000;

/** Frames for a duration at the test hop. */
export function frames(ms: number): number {
	return Math.round(ms / HOP_MS);
}
