import { describe, expect, it } from 'vitest';
import { detectDarkCredits } from './darkframes';

/** Samples every `step` ms from `start` with values from `value(t)`. */
function series(start: number, end: number, step: number, value: (t: number) => number) {
	const timesMs: number[] = [];
	const pblack: number[] = [];
	for (let t = start; t < end; t += step) {
		timesMs.push(t);
		pblack.push(value(t));
	}
	return { timesMs, pblack };
}

const MIN = 60_000;

describe('detectDarkCredits', () => {
	it('finds rolling credits that run to the end of a movie', () => {
		const duration = 120 * MIN;
		const credits = detectDarkCredits(
			series(duration - 15 * MIN, duration, 10_000, (t) => (t >= 112 * MIN ? 85 : 20)),
			duration,
			'movie'
		);
		expect(credits).toMatchObject({ kind: 'credits', source: 'darkframes', endMs: duration });
		expect(Math.abs(credits!.startMs - 112 * MIN)).toBeLessThanOrEqual(5000);
	});

	it('follows dense credits down to the end, bridging lighter samples', () => {
		const duration = 100 * MIN;
		const credits = detectDarkCredits(
			series(duration - 15 * MIN, duration, 10_000, (t) => {
				if (t < 92 * MIN) return 10;
				if (t < 95 * MIN) return 90;
				return t % 30_000 === 0 ? 55 : 72;
			}),
			duration,
			'movie'
		);
		expect(credits?.endMs).toBe(duration);
		expect(Math.abs(credits!.startMs - 92 * MIN)).toBeLessThanOrEqual(5000);
	});

	it('does not start at a dark frame a few lit samples before the credits', () => {
		// Keyframes of a real episode (ffmpeg 9): a dark shot at 21:03, the last
		// scene, then the credits roll from 21:23.
		const times = [
			1230, 1233, 1235, 1238, 1240, 1249, 1251, 1261, 1263, 1269, 1273, 1279, 1283, 1294, 1297
		];
		const values = [12, 15, 1, 18, 0, 0, 0, 0, 71, 23, 20, 23, 98, 93, 89];
		const credits = detectDarkCredits(
			{ timesMs: times.map((t) => t * 1000), pblack: values },
			1310_000,
			'series'
		);
		expect(credits?.startMs).toBe(1281_000);
	});

	it('stops before a post-credits scene', () => {
		const duration = 22 * MIN;
		const credits = detectDarkCredits(
			series(duration - 6 * MIN, duration, 2000, (t) => (t >= 20 * MIN && t < 20.5 * MIN ? 90 : 0)),
			duration,
			'series'
		);
		expect(credits).not.toBeNull();
		expect(Math.abs(credits!.startMs - 20 * MIN)).toBeLessThanOrEqual(1000);
		expect(Math.abs(credits!.endMs - 20.5 * MIN)).toBeLessThanOrEqual(1000);
	});

	it('ignores short fades and night scenes', () => {
		const duration = 45 * MIN;
		expect(
			detectDarkCredits(
				series(duration - 6 * MIN, duration, 2000, (t) =>
					t >= 42 * MIN && t < 42.2 * MIN ? 100 : 5
				),
				duration,
				'series'
			)
		).toBeNull();
		// A long, letterboxed night scene: bars (~25%) plus dark picture, 45–54.
		expect(
			detectDarkCredits(
				series(duration - 6 * MIN, duration, 10_000, (t) => 45 + ((t / 10_000) % 10)),
				duration,
				'series'
			)
		).toBeNull();
	});

	it('ignores dark stretches too early in the file', () => {
		const duration = 30 * MIN;
		expect(
			detectDarkCredits(
				series(5 * MIN, 12 * MIN, 5000, () => 95),
				duration,
				'series'
			)
		).toBeNull();
	});

	it('handles empty input', () => {
		expect(detectDarkCredits({ timesMs: [], pblack: [] }, 1000, 'movie')).toBeNull();
	});
});
