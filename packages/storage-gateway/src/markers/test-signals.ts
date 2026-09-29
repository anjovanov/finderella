import { SAMPLE_RATE } from './fingerprint.js';

/** Deterministic PRNG (mulberry32) for reproducible test signals. */
export function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Music-like test audio: a new random chord (three partials in the 300–2000 Hz
 * fingerprint range) every 250 ms, plus a little noise.
 */
export function musicLike(seconds: number, seed: number): Float32Array {
	const rand = prng(seed);
	const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
	const noteLen = Math.round(SAMPLE_RATE / 4);
	let freqs = [0, 0, 0];
	for (let i = 0; i < out.length; i++) {
		if (i % noteLen === 0) freqs = [0, 0, 0].map(() => 300 + rand() * 1700);
		let s = 0;
		for (const f of freqs) s += Math.sin((2 * Math.PI * f * i) / SAMPLE_RATE);
		out[i] = 0.2 * s + 0.02 * (rand() * 2 - 1);
	}
	return out;
}

export function withNoise(signal: Float32Array, snrDb: number, seed: number): Float32Array {
	const rand = prng(seed);
	let power = 0;
	for (const s of signal) power += s * s;
	power /= signal.length;
	const noiseAmp = Math.sqrt((power / Math.pow(10, snrDb / 10)) * 3); // uniform [-a, a] has power a²/3
	return signal.map((s) => s + noiseAmp * (rand() * 2 - 1));
}

/** Bit error rate over positions where both values carry information. */
export function ber(a: Uint32Array, b: Uint32Array): number {
	let bits = 0;
	let compared = 0;
	for (let i = 0; i < Math.min(a.length, b.length); i++) {
		if (a[i] === 0 || b[i] === 0) continue;
		let x = (a[i] ^ b[i]) >>> 0;
		while (x) {
			bits += x & 1;
			x >>>= 1;
		}
		compared++;
	}
	return compared === 0 ? 1 : bits / (compared * 32);
}
