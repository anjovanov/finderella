import { describe, expect, it } from 'vitest';
import {
	REQUIRED_FILTERS,
	assessFfmpeg,
	parseComponentList,
	parseFfmpegVersion,
	pickBestCandidate
} from './tools.js';

const ENCODERS = `Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D a64multi             Multicolor charset for Commodore 64 (codec a64_multi)
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 A....D aac                  AAC (Advanced Audio Coding)
`;

// ffmpeg 9 prints two flag columns, older builds three.
const FILTERS_V9 = `Filters:
  T.. = Timeline support
  A = Audio input/output
  | = Source or sink filter
  ------
 TS aap               AA->A      Apply Affine Projection algorithm to first audio stream.
 .. scale             V->V       Scale the input video size and/or convert the image format.
 .S zscale            V->V       Apply resizing, colorspace and bit depth conversion.
`;
const FILTERS_V7 = ` ... tpad              V->V       Temporarily pad video frames.\r
 .S. tonemap           V->V       Conversion to/from different dynamic ranges.\r
`;

describe('parseFfmpegVersion', () => {
	it('reads release numbers from distro, static and tagged builds', () => {
		expect(parseFfmpegVersion('ffmpeg version 4.4.2-0ubuntu0.22.04.1 Copyright')).toEqual([4, 4]);
		expect(parseFfmpegVersion('ffmpeg version 7.0.2-static https://johnvansickle.com')).toEqual([
			7, 0
		]);
		expect(parseFfmpegVersion('ffmpeg version n9.0.2 Copyright (c) 2000-2026')).toEqual([9, 0]);
		expect(parseFfmpegVersion('ffmpeg version 6.1.1-full_build-www.gyan.dev')).toEqual([6, 1]);
	});

	it('returns null for git snapshots', () => {
		expect(parseFfmpegVersion('ffmpeg version N-112345-g1234abcd-static')).toBeNull();
		expect(parseFfmpegVersion('ffmpeg version 2024-03-07-git-97beb63a66-full_build')).toBeNull();
		expect(parseFfmpegVersion('')).toBeNull();
	});
});

describe('parseComponentList', () => {
	it('reads names and skips legend lines', () => {
		expect([...parseComponentList(ENCODERS)]).toEqual(['a64multi', 'libx264', 'aac']);
		expect([...parseComponentList(FILTERS_V9)]).toEqual(['aap', 'scale', 'zscale']);
		expect([...parseComponentList(FILTERS_V7)]).toEqual(['tpad', 'tonemap']);
	});
});

describe('assessFfmpeg', () => {
	const allFilters = new Set<string>([...REQUIRED_FILTERS, 'zscale', 'tonemap']);
	const encoders = new Set(['libx264', 'aac']);

	it('accepts a complete build', () => {
		expect(
			assessFfmpeg({ versionLine: 'ffmpeg version 7.0.2', encoders, filters: allFilters })
		).toEqual({ ok: true, missing: [], hdrTonemap: true });
	});

	it("flags Fedora's ffmpeg-free (no libx264)", () => {
		const result = assessFfmpeg({
			versionLine: 'ffmpeg version 7.1.1',
			encoders: new Set(['aac', 'libopenh264']),
			filters: allFilters
		});
		expect(result.ok).toBe(false);
		expect(result.missing).toEqual(['encoder libx264']);
	});

	it('flags releases older than 5.1 but trusts git snapshots', () => {
		expect(
			assessFfmpeg({ versionLine: 'ffmpeg version 4.4.2', encoders, filters: allFilters }).missing
		).toEqual(['version 4.4 < 5.1']);
		expect(
			assessFfmpeg({ versionLine: 'ffmpeg version 5.0.1', encoders, filters: allFilters }).ok
		).toBe(false);
		expect(
			assessFfmpeg({ versionLine: 'ffmpeg version N-1-gabc', encoders, filters: allFilters }).ok
		).toBe(true);
	});

	it('treats missing zscale as no HDR tone-mapping, not a failure', () => {
		const filters = new Set<string>(REQUIRED_FILTERS);
		expect(assessFfmpeg({ versionLine: 'ffmpeg version 6.0', encoders, filters })).toEqual({
			ok: true,
			missing: [],
			hdrTonemap: false
		});
	});
});

describe('pickBestCandidate', () => {
	const make = (name: string, missing: string[], hdrTonemap = true) => ({
		name,
		assessment: { ok: missing.length === 0, missing, hdrTonemap }
	});

	it('prefers complete builds, then fewer gaps, then HDR, keeping order on ties', () => {
		expect(
			pickBestCandidate([make('system', ['encoder libx264']), make('bundled', [])])?.name
		).toBe('bundled');
		expect(pickBestCandidate([make('system', [], false), make('bundled', [])])?.name).toBe(
			'bundled'
		);
		expect(pickBestCandidate([make('system', []), make('bundled', [])])?.name).toBe('system');
		expect(pickBestCandidate([])).toBeNull();
	});

	it('prefers a working GPU encoder among equally complete builds, never over correctness', () => {
		const gpu = (c: ReturnType<typeof make>) => ({ ...c, hardware: true });
		expect(pickBestCandidate([make('system', []), gpu(make('bundled', []))])?.name).toBe('bundled');
		expect(pickBestCandidate([gpu(make('system', [])), make('bundled', [])])?.name).toBe('system');
		// HDR tone-mapping and required pieces outrank speed.
		expect(pickBestCandidate([gpu(make('system', [], false)), make('bundled', [])])?.name).toBe(
			'bundled'
		);
		expect(
			pickBestCandidate([gpu(make('system', ['filter tpad'])), make('bundled', [])])?.name
		).toBe('bundled');
	});
});
