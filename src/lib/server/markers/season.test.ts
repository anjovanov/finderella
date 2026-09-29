import { describe, expect, it } from 'vitest';
import { consensus, detectSeasonMarkers, pickPartners, type SeasonFile } from './season';
import { frames, HOP_MS, plant, randomFingerprint } from './test-fingerprints';

const REGION_MS = 600_000;
const DURATION_MS = 45 * 60_000;

function episode(
	n: number,
	introAt: number | null,
	opts: {
		theme?: Uint32Array;
		extra?: { segment: Uint32Array; at: number };
		season?: number;
		version?: number;
	} = {}
): SeasonFile {
	let fp = randomFingerprint(frames(REGION_MS), 1000 + n * 7 + (opts.season ?? 1) * 1000);
	if (introAt !== null) fp = plant(fp, opts.theme ?? THEME, frames(introAt), 0.05, n);
	if (opts.extra) fp = plant(fp, opts.extra.segment, frames(opts.extra.at), 0.05, n + 50);
	return {
		id: `f${opts.season ?? 1}-${n}`,
		episodeId: `e${opts.season ?? 1}-${n}`,
		seasonNumber: opts.season ?? 1,
		episodeNumber: n,
		durationMs: DURATION_MS,
		version: opts.version ?? 1,
		hopMs: HOP_MS,
		intro: { startMs: 0, fingerprint: fp }
	};
}

const THEME = randomFingerprint(frames(45_000), 7777);

describe('consensus', () => {
	it('keeps what at least `need` segments cover', () => {
		expect(
			consensus(
				[
					{ startMs: 0, endMs: 100 },
					{ startMs: 10, endMs: 90 },
					{ startMs: 500, endMs: 900 }
				],
				2
			)
		).toEqual({ startMs: 10, endMs: 90, support: 2 });
		expect(consensus([{ startMs: 0, endMs: 100 }], 2)).toBeNull();
	});
});

describe('pickPartners', () => {
	it('prefers nearby episodes, skips copies and other versions', () => {
		const files = [1, 2, 3, 4, 5, 6, 7].map((n) => episode(n, 60_000));
		const copy = { ...files[2], id: 'copy-3' };
		const other = { ...episode(8, 60_000), version: 2 };
		const partners = pickPartners(files[3], [...files, copy, other], 'intro');
		expect(partners.map((p) => p.episodeNumber)).toEqual([3, 5, 2, 6]);
	});
});

describe('detectSeasonMarkers', () => {
	it('finds the intro wherever the cold open ends', async () => {
		const files = [0, 90_000, 300_000, 45_000, 120_000].map((at, i) => episode(i + 1, at));
		const result = await detectSeasonMarkers(files);
		files.forEach((file, i) => {
			const intro = result.get(file.id)!.find((m) => m.kind === 'intro');
			const at = [0, 90_000, 300_000, 45_000, 120_000][i];
			expect(intro, file.id).toBeDefined();
			expect(Math.abs(intro!.startMs - at)).toBeLessThan(1000);
			expect(Math.abs(intro!.endMs - (at + 45_000))).toBeLessThan(1000);
			expect(intro!.confidence).toBeGreaterThanOrEqual(0.5);
		});
	});

	it('rejects a recap only one other episode shares', async () => {
		const recap = randomFingerprint(frames(60_000), 4242);
		const files = [
			episode(1, 100_000, { extra: { segment: recap, at: 300_000 } }),
			episode(2, 100_000, { extra: { segment: recap, at: 0 } }),
			episode(3, 100_000),
			episode(4, 100_000)
		];
		const intro = (await detectSeasonMarkers(files)).get('f1-2')!.find((m) => m.kind === 'intro');
		expect(Math.abs(intro!.startMs - 100_000)).toBeLessThan(1000);
	});

	it('follows a mid-season theme change', async () => {
		const newTheme = randomFingerprint(frames(40_000), 5151);
		const files = [1, 2, 3, 4, 5, 6].map((n) =>
			episode(n, 60_000, n > 3 ? { theme: newTheme } : {})
		);
		const result = await detectSeasonMarkers(files);
		for (const file of files) {
			const intro = result.get(file.id)!.find((m) => m.kind === 'intro');
			expect(intro, file.id).toBeDefined();
			const length = file.episodeNumber > 3 ? 40_000 : 45_000;
			expect(Math.abs(intro!.endMs - intro!.startMs - length)).toBeLessThan(1500);
		}
	});

	it('needs a second episode, and is stricter with only one', async () => {
		expect((await detectSeasonMarkers([episode(1, 60_000)])).get('f1-1')).toEqual([]);
		const pair = await detectSeasonMarkers([episode(1, 60_000), episode(2, 30_000)]);
		expect(pair.get('f1-1')![0]).toMatchObject({ kind: 'intro', confidence: 0.5 });
		const short = randomFingerprint(frames(17_000), 31);
		const weak = await detectSeasonMarkers([
			episode(1, 60_000, { theme: short }),
			episode(2, 30_000, { theme: short })
		]);
		expect(weak.get('f1-1')).toEqual([]);
	});

	it('borrows partners from an adjacent season, never compares versions', async () => {
		const files = [
			episode(1, 60_000, { season: 2 }),
			episode(1, 60_000, { season: 1 }),
			episode(2, 60_000, { season: 1 }),
			episode(3, 60_000, { season: 1, version: 2 })
		];
		const result = await detectSeasonMarkers(files, new Set(['f2-1']));
		expect(result.size).toBe(1);
		expect(result.get('f2-1')![0]).toMatchObject({ kind: 'intro' });
	});

	it('only accepts credits in the second half of the file', async () => {
		const ending = randomFingerprint(frames(60_000), 888);
		const withCredits = (n: number, regionStart: number): SeasonFile => ({
			...episode(n, null),
			intro: undefined,
			credits: {
				startMs: regionStart,
				fingerprint: plant(
					randomFingerprint(frames(360_000), 60 + n),
					ending,
					frames(200_000),
					2,
					n
				)
			}
		});
		const late = await detectSeasonMarkers(
			[1, 2, 3].map((n) => withCredits(n, DURATION_MS - 360_000))
		);
		const credits = late.get('f1-1')!.find((m) => m.kind === 'credits');
		expect(Math.abs(credits!.startMs - (DURATION_MS - 160_000))).toBeLessThan(1000);
		const early = await detectSeasonMarkers([1, 2, 3].map((n) => withCredits(n, 0)));
		expect(early.get('f1-1')).toEqual([]);
	});
});
