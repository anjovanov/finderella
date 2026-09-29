/**
 * In-place iterative radix-2 FFT for one fixed power-of-two size. Twiddles
 * and the bit-reversal permutation are computed once per instance, so the
 * fingerprinter can run tens of thousands of frames without allocating.
 */
export class Fft {
	readonly size: number;
	#cos: Float64Array;
	#sin: Float64Array;
	#rev: Uint32Array;

	constructor(size: number) {
		if (size < 2 || (size & (size - 1)) !== 0) throw new Error('FFT size must be a power of two');
		this.size = size;
		this.#cos = new Float64Array(size / 2);
		this.#sin = new Float64Array(size / 2);
		for (let i = 0; i < size / 2; i++) {
			this.#cos[i] = Math.cos((2 * Math.PI * i) / size);
			this.#sin[i] = -Math.sin((2 * Math.PI * i) / size);
		}
		const bits = Math.log2(size);
		this.#rev = new Uint32Array(size);
		for (let i = 0; i < size; i++) {
			let r = 0;
			for (let b = 0; b < bits; b++) r = (r << 1) | ((i >>> b) & 1);
			this.#rev[i] = r;
		}
	}

	/** Forward transform of (re, im) in place. */
	transform(re: Float64Array, im: Float64Array): void {
		const n = this.size;
		const rev = this.#rev;
		for (let i = 0; i < n; i++) {
			const j = rev[i];
			if (j > i) {
				let t = re[i];
				re[i] = re[j];
				re[j] = t;
				t = im[i];
				im[i] = im[j];
				im[j] = t;
			}
		}
		for (let half = 1; half < n; half <<= 1) {
			const step = n / (half * 2);
			for (let start = 0; start < n; start += half * 2) {
				for (let k = 0; k < half; k++) {
					const wr = this.#cos[k * step];
					const wi = this.#sin[k * step];
					const a = start + k;
					const b = a + half;
					const tr = re[b] * wr - im[b] * wi;
					const ti = re[b] * wi + im[b] * wr;
					re[b] = re[a] - tr;
					im[b] = im[a] - ti;
					re[a] += tr;
					im[a] += ti;
				}
			}
		}
	}
}

/** Periodic Hann window of `size` samples. */
export function hannWindow(size: number): Float64Array {
	const w = new Float64Array(size);
	for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
	return w;
}
