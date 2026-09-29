import { describe, expect, it } from 'vitest';
import { Fft } from './fft.js';

describe('Fft', () => {
	it('puts a pure tone in its bin', () => {
		const n = 256;
		const fft = new Fft(n);
		const re = new Float64Array(n);
		const im = new Float64Array(n);
		for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 10 * i) / n);
		fft.transform(re, im);
		const mags = Array.from(re, (r, i) => Math.hypot(r, im[i]));
		expect(mags[10]).toBeCloseTo(n / 2, 6);
		expect(mags[n - 10]).toBeCloseTo(n / 2, 6);
		expect(mags.filter((m) => m > 1e-6)).toHaveLength(2);
	});

	it('preserves energy (Parseval)', () => {
		const n = 2048;
		const fft = new Fft(n);
		const re = new Float64Array(n);
		const im = new Float64Array(n);
		let seed = 1;
		for (let i = 0; i < n; i++) {
			seed = (seed * 16807) % 2147483647;
			re[i] = seed / 2147483647 - 0.5;
		}
		const timeEnergy = re.reduce((sum, v) => sum + v * v, 0);
		fft.transform(re, im);
		let freqEnergy = 0;
		for (let i = 0; i < n; i++) freqEnergy += re[i] * re[i] + im[i] * im[i];
		expect(freqEnergy / n).toBeCloseTo(timeEnergy, 6);
	});

	it('rejects sizes that are not a power of two', () => {
		expect(() => new Fft(1000)).toThrow();
	});
});
