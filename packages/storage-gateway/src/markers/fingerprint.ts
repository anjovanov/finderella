import { Fft, hannWindow } from './fft.js';

/**
 * Audio sub-fingerprints in the style of Haitsma & Kalker ("A Highly Robust
 * Audio Fingerprinting System", 2002): every hop, the energy of 33
 * log-spaced bands between 300 and 2000 Hz is measured and 32 bits record
 * the sign of the band-to-band energy difference minus the previous frame's.
 * Only our own fingerprints are ever compared (episodes of one season), so
 * no external format compatibility is needed — but the hub compares values
 * from different devices, hence FINGERPRINT_VERSION: bump it whenever any
 * constant or step below changes (it is part of the cache key, and the hub
 * only compares equal versions).
 */
export const FINGERPRINT_VERSION = 1;
export const SAMPLE_RATE = 5512;
export const FRAME_SIZE = 2048;
export const HOP_SIZE = 256;
export const HOP_MS = (HOP_SIZE / SAMPLE_RATE) * 1000;

const BANDS = 33;
const MIN_HZ = 300;
const MAX_HZ = 2000;
/** Frames quieter than this RMS (about -60 dBFS) carry no information. */
const SILENCE_RMS = 1e-3;

/** FFT bin ranges [lo, hi) of the 33 bands. */
function bandEdges(): Uint16Array {
	const binHz = SAMPLE_RATE / FRAME_SIZE;
	const edges = new Uint16Array(BANDS + 1);
	for (let k = 0; k <= BANDS; k++) {
		const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, k / BANDS);
		edges[k] = Math.round(hz / binHz);
	}
	return edges;
}

/**
 * Streaming fingerprinter: feed mono PCM at SAMPLE_RATE in chunks of any
 * size; value i describes the frame starting at sample i × HOP_SIZE. A value
 * of 0 means "no information" (the frame or its predecessor was silent, or
 * it's the first frame) — a genuine all-zero hash is stored as 1.
 */
export class Fingerprinter {
	#fft = new Fft(FRAME_SIZE);
	#window = hannWindow(FRAME_SIZE);
	#edges = bandEdges();
	#re = new Float64Array(FRAME_SIZE);
	#im = new Float64Array(FRAME_SIZE);
	#energy = new Float64Array(BANDS);
	#prevEnergy = new Float64Array(BANDS);
	#prevSilent = true;
	#buf = new Float32Array(FRAME_SIZE * 4);
	#len = 0;
	#out: number[] = [];

	push(samples: Float32Array): void {
		let offset = 0;
		while (offset < samples.length) {
			const n = Math.min(samples.length - offset, this.#buf.length - this.#len);
			this.#buf.set(samples.subarray(offset, offset + n), this.#len);
			this.#len += n;
			offset += n;
			this.#drain();
		}
	}

	/** Values for every complete frame pushed so far (a trailing partial frame is dropped). */
	finish(): Uint32Array {
		return Uint32Array.from(this.#out);
	}

	#drain(): void {
		let start = 0;
		while (this.#len - start >= FRAME_SIZE) {
			this.#frame(start);
			start += HOP_SIZE;
		}
		if (start > 0) {
			this.#buf.copyWithin(0, start, this.#len);
			this.#len -= start;
		}
	}

	#frame(start: number): void {
		const re = this.#re;
		const im = this.#im;
		let sumSquares = 0;
		for (let i = 0; i < FRAME_SIZE; i++) {
			const s = this.#buf[start + i];
			sumSquares += s * s;
			re[i] = s * this.#window[i];
			im[i] = 0;
		}
		const silent = Math.sqrt(sumSquares / FRAME_SIZE) < SILENCE_RMS;

		this.#fft.transform(re, im);
		const energy = this.#energy;
		for (let band = 0; band < BANDS; band++) {
			let e = 0;
			for (let bin = this.#edges[band]; bin < this.#edges[band + 1]; bin++) {
				e += re[bin] * re[bin] + im[bin] * im[bin];
			}
			energy[band] = e;
		}

		let value = 0;
		if (!silent && !this.#prevSilent && this.#out.length > 0) {
			const prev = this.#prevEnergy;
			let hash = 0;
			for (let m = 0; m < 32; m++) {
				const d = energy[m] - energy[m + 1] - (prev[m] - prev[m + 1]);
				if (d > 0) hash |= 1 << m;
			}
			value = hash >>> 0 || 1;
		}
		this.#out.push(value);
		this.#prevEnergy.set(energy);
		this.#prevSilent = silent;
	}
}

/** Fingerprint a whole buffer at once (tests, small inputs). */
export function fingerprint(samples: Float32Array): Uint32Array {
	const fp = new Fingerprinter();
	fp.push(samples);
	return fp.finish();
}
