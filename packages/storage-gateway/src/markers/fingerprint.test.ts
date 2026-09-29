import { describe, expect, it } from 'vitest';
import { fingerprint, Fingerprinter, FRAME_SIZE, HOP_SIZE, SAMPLE_RATE } from './fingerprint.js';
import { ber, musicLike, withNoise } from './test-signals.js';

describe('fingerprint', () => {
	const audio = musicLike(20, 1);
	const reference = fingerprint(audio);

	it('emits one value per hop', () => {
		expect(reference.length).toBe(Math.floor((audio.length - FRAME_SIZE) / HOP_SIZE) + 1);
	});

	it('is deterministic and independent of chunking', () => {
		const fp = new Fingerprinter();
		for (let i = 0; i < audio.length; i += 777) fp.push(audio.subarray(i, i + 777));
		expect(Array.from(fp.finish())).toEqual(Array.from(reference));
	});

	it('ignores volume changes', () => {
		expect(ber(reference, fingerprint(audio.map((s) => s * 0.3)))).toBe(0);
	});

	it('survives noise and sub-hop misalignment', () => {
		expect(ber(reference, fingerprint(withNoise(audio, 20, 7)))).toBeLessThan(0.22);
		expect(ber(reference, fingerprint(audio.subarray(HOP_SIZE / 2)))).toBeLessThan(0.18);
	});

	it('looks random against unrelated audio', () => {
		const other = ber(reference, fingerprint(musicLike(20, 2)));
		expect(other).toBeGreaterThan(0.45);
		expect(other).toBeLessThan(0.55);
	});

	it('marks silence (and only silence) with 0', () => {
		expect(Array.from(fingerprint(new Float32Array(SAMPLE_RATE * 5))).every((v) => v === 0)).toBe(
			true
		);
		// The first frame has no predecessor; everything after it carries data.
		expect(Array.from(reference.subarray(1)).every((v) => v !== 0)).toBe(true);
	});
});
