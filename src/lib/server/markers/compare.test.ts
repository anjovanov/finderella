import { describe, expect, it } from 'vitest';
import { compareFingerprints, popcount32 } from './compare';
import { frames, HOP_MS, plant, randomFingerprint } from './test-fingerprints';

const opts = { hopMs: HOP_MS, minMs: 15_000, maxMs: 150_000 };

describe('popcount32', () => {
	it('counts bits', () => {
		expect(popcount32(0)).toBe(0);
		expect(popcount32(0xffffffff)).toBe(32);
		expect(popcount32(0b1011)).toBe(3);
	});
});

describe('compareFingerprints', () => {
	const intro = randomFingerprint(frames(40_000), 99);

	it('finds a shared segment at different positions despite noise', () => {
		const a = plant(randomFingerprint(frames(600_000), 1), intro, frames(90_000), 0.05, 11);
		const b = plant(randomFingerprint(frames(600_000), 2), intro, frames(20_000), 0.05, 12);
		const seg = compareFingerprints(a, b, opts);
		expect(seg).not.toBeNull();
		expect(Math.abs(seg!.aStartMs - 90_000)).toBeLessThan(500);
		expect(Math.abs(seg!.aEndMs - 130_000)).toBeLessThan(500);
		expect(Math.abs(seg!.bStartMs - 20_000)).toBeLessThan(500);
		expect(seg!.ber).toBeLessThan(0.15);
	});

	it('returns null when nothing is shared', () => {
		expect(
			compareFingerprints(
				randomFingerprint(frames(300_000), 3),
				randomFingerprint(frames(300_000), 4),
				opts
			)
		).toBeNull();
	});

	it('ignores segments shorter than the minimum', () => {
		const short = randomFingerprint(frames(8000), 5);
		const a = plant(randomFingerprint(frames(120_000), 6), short, 100, 0, 1);
		const b = plant(randomFingerprint(frames(120_000), 7), short, 900, 0, 2);
		expect(compareFingerprints(a, b, opts)).toBeNull();
	});

	it('never matches silence or a constant tone', () => {
		const silentA = plant(
			randomFingerprint(frames(120_000), 8),
			new Uint32Array(frames(40_000)),
			200,
			0,
			1
		);
		const silentB = plant(
			randomFingerprint(frames(120_000), 9),
			new Uint32Array(frames(40_000)),
			500,
			0,
			1
		);
		// plant() turns 0 into 1 — restore real silence.
		silentA.fill(0, 200, 200 + frames(40_000));
		silentB.fill(0, 500, 500 + frames(40_000));
		expect(compareFingerprints(silentA, silentB, opts)).toBeNull();

		const tone = new Uint32Array(frames(40_000)).fill(0x12345678);
		const a = plant(randomFingerprint(frames(120_000), 10), tone, 200, 0, 1);
		const b = plant(randomFingerprint(frames(120_000), 11), tone, 500, 0, 1);
		expect(compareFingerprints(a, b, opts)).toBeNull();
	});

	it('rejects shared stretches longer than the maximum (identical files)', () => {
		const same = randomFingerprint(frames(300_000), 12);
		expect(compareFingerprints(same, same, opts)).toBeNull();
	});
});
