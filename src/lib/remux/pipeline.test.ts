import { AudioSample } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { downmixToStereo } from './pipeline';

/** A planar f32 sample with one constant value per channel. */
function sample(values: number[], frames = 4): AudioSample {
	const data = new Float32Array(values.length * frames);
	values.forEach((v, c) => data.fill(v, c * frames, (c + 1) * frames));
	return new AudioSample({
		data,
		format: 'f32-planar',
		numberOfChannels: values.length,
		sampleRate: 48_000,
		timestamp: 12.5
	});
}

function planes(s: AudioSample): number[][] {
	return Array.from({ length: s.numberOfChannels }, (_, c) => {
		const plane = new Float32Array(s.numberOfFrames);
		s.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
		return [...plane];
	});
}

describe('downmixToStereo', () => {
	it('mixes 5.1 (FL FR FC LFE SL SR) at full level with ITU coefficients, dropping LFE', () => {
		const out = downmixToStereo(sample([0.2, 0.4, 0.5, 1, 0.1, 0.3]));
		expect(out.numberOfChannels).toBe(2);
		expect(out.timestamp).toBe(12.5);
		const k = Math.SQRT1_2;
		const [left, right] = planes(out);
		// Not normalized: as loud as ffmpeg's `-ac 2` transcode and browser direct play.
		expect(left[0]).toBeCloseTo(0.2 + k * 0.5 + k * 0.1, 6);
		expect(right[3]).toBeCloseTo(0.4 + k * 0.5 + k * 0.3, 6);
	});

	it('clamps peaks past full scale', () => {
		const [left, right] = planes(downmixToStereo(sample([1, -1, 1, 1, 1, -1])));
		expect(left.every((v) => v === 1)).toBe(true);
		// -1 + 0.707 - 0.707 stays inside the range untouched.
		expect(right[0]).toBeCloseTo(-1, 6);
	});

	it('duplicates mono and keeps the front pair of other layouts', () => {
		expect(planes(downmixToStereo(sample([0.3])))).toEqual([
			[0.3, 0.3, 0.3, 0.3].map(Math.fround),
			[0.3, 0.3, 0.3, 0.3].map(Math.fround)
		]);
		const [left, right] = planes(downmixToStereo(sample([0.1, 0.2, 0.9])));
		expect(left[0]).toBeCloseTo(0.1, 6);
		expect(right[0]).toBeCloseTo(0.2, 6);
	});
});
