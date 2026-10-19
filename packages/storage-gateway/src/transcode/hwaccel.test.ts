import { describe, expect, it } from 'vitest';
import type { TranscodeQuality } from './ffmpeg.js';
import {
	HW_GOP_FRAMES,
	accelFitsQuality,
	avcProfileLevel,
	hwCandidates,
	hwFilterTail,
	hwInputArgs,
	hwVideoArgs,
	judgeSelftest,
	rankRenderNodes,
	type HwAccel,
	type HwEnvironment,
	type RenderNode
} from './hwaccel.js';

const auto: TranscodeQuality = { maxWidth: 3840, audioKbps: 192, level: '4.1' };
const capped: TranscodeQuality = {
	maxWidth: 1920,
	maxVideoKbps: 8000,
	audioKbps: 192,
	level: '4.1'
};

function valueAfter(args: string[], flag: string): string | undefined {
	const i = args.indexOf(flag);
	return i === -1 ? undefined : args[i + 1];
}

const amdApu: RenderNode = {
	path: '/dev/dri/renderD128',
	vendor: '0x1002',
	driver: 'amdgpu',
	vramBytes: 512 * 1024 ** 2
};
const amdCard: RenderNode = {
	path: '/dev/dri/renderD129',
	vendor: '0x1002',
	driver: 'amdgpu',
	vramBytes: 16 * 1024 ** 3
};
const intel: RenderNode = { path: '/dev/dri/renderD128', vendor: '0x8086', driver: 'i915' };
const nvidia: RenderNode = { path: '/dev/dri/renderD129', vendor: '0x10de', driver: 'nvidia' };

const linux: HwEnvironment = {
	platform: 'linux',
	arch: 'x64',
	nodes: [],
	nvidia: false,
	raspberryPi: false,
	v4l2Encoder: false,
	hwaccels: ['vdpau', 'cuda', 'vaapi', 'drm']
};

describe('hwVideoArgs', () => {
	const vaapi: HwAccel = { encoder: 'vaapi', device: '/dev/dri/renderD128', label: 'VAAPI' };

	it('keeps the HLS contract on every backend', () => {
		for (const encoder of ['nvenc', 'qsv', 'amf', 'vaapi', 'videotoolbox', 'v4l2m2m'] as const) {
			const args = hwVideoArgs({ encoder, label: encoder }, capped);
			expect(valueAfter(args, '-c:v')).toMatch(/^h264_/);
			expect(valueAfter(args, '-g')).toBe(String(HW_GOP_FRAMES));
			expect(['high', '100']).toContain(valueAfter(args, '-profile:v'));
			expect(['4.1', '41']).toContain(valueAfter(args, '-level'));
			// VAAPI gets its 8-bit surface from the filter chain (format=nv12,hwupload).
			if (encoder !== 'vaapi') expect(['yuv420p', 'nv12']).toContain(valueAfter(args, '-pix_fmt'));
		}
	});

	it('uses constant quality uncapped and VBR at the cap otherwise', () => {
		expect(hwVideoArgs(vaapi, auto)).toEqual(
			expect.arrayContaining(['-rc_mode', 'CQP', '-qp', '23'])
		);
		const vbr = hwVideoArgs(vaapi, capped);
		expect(valueAfter(vbr, '-rc_mode')).toBe('VBR');
		expect(valueAfter(vbr, '-b:v')).toBe('5200k');
		expect(valueAfter(vbr, '-maxrate')).toBe('8000k');
		expect(valueAfter(vbr, '-bufsize')).toBe('16000k');

		const nvenc = hwVideoArgs({ encoder: 'nvenc', device: '1', label: 'NVENC' }, capped);
		expect(valueAfter(nvenc, '-gpu')).toBe('1');
		expect(valueAfter(nvenc, '-cq')).toBe('23');
		expect(valueAfter(nvenc, '-maxrate')).toBe('8000k');
		expect(valueAfter(nvenc, '-forced-idr')).toBe('1');
	});

	it('names levels for most encoders and numbers them for qsv/v4l2m2m', () => {
		const uhd: TranscodeQuality = { ...auto, level: '5.2' };
		expect(valueAfter(hwVideoArgs({ encoder: 'nvenc', label: '' }, uhd), '-level')).toBe('5.2');
		expect(valueAfter(hwVideoArgs({ encoder: 'qsv', label: '' }, uhd), '-level')).toBe('52');
	});

	it('gives bitrate-only encoders a bitrate even without a cap', () => {
		const pi = hwVideoArgs({ encoder: 'v4l2m2m', bitrateOnly: true, label: '' }, auto);
		expect(valueAfter(pi, '-b:v')).toBe('25000k');
		const intelMac = hwVideoArgs(
			{ encoder: 'videotoolbox', bitrateOnly: true, label: '' },
			{
				...auto,
				maxWidth: 1280
			}
		);
		expect(valueAfter(intelMac, '-b:v')).toBe('4000k');
		expect(intelMac).not.toContain('-q:v');
		const appleSilicon = hwVideoArgs({ encoder: 'videotoolbox', label: '' }, auto);
		expect(appleSilicon).toContain('-q:v');
		expect(valueAfter(appleSilicon, '-allow_sw')).toBe('0');
	});

	it('refuses a decode-only accelerator', () => {
		expect(() => hwVideoArgs({ encoder: null, decode: 'drm', label: '' }, auto)).toThrow();
	});
});

describe('hwInputArgs / hwFilterTail', () => {
	it('opens the VAAPI device for upload and decodes on it', () => {
		const accel: HwAccel = {
			encoder: 'vaapi',
			device: '/dev/dri/renderD129',
			decode: 'vaapi',
			label: ''
		};
		expect(hwInputArgs(accel)).toEqual([
			'-init_hw_device',
			'vaapi=gpu:/dev/dri/renderD129',
			'-filter_hw_device',
			'gpu',
			'-hwaccel',
			'vaapi',
			'-hwaccel_device',
			'gpu'
		]);
		// Encode-only still needs the device for hwupload.
		expect(hwInputArgs({ ...accel, decode: undefined })).toEqual([
			'-init_hw_device',
			'vaapi=gpu:/dev/dri/renderD129',
			'-filter_hw_device',
			'gpu'
		]);
		expect(hwFilterTail('vaapi')).toEqual(['format=nv12', 'hwupload']);
		expect(hwFilterTail('nvenc')).toEqual(['format=yuv420p']);
	});

	it('never asks for hardware output frames (CPU filters, software fallback)', () => {
		const args = hwInputArgs({ encoder: 'nvenc', decode: 'cuda', device: '1', label: '' });
		expect(args).toEqual(['-hwaccel', 'cuda', '-hwaccel_device', '1']);
		expect(args).not.toContain('-hwaccel_output_format');
	});

	it('decodes only the listed codecs on codec-limited decoders', () => {
		const pi: HwAccel = { encoder: null, decode: 'drm', decodeCodecs: ['hevc'], label: '' };
		expect(hwInputArgs(pi, 'hevc')).toEqual(['-hwaccel', 'drm']);
		expect(hwInputArgs(pi, 'h264')).toEqual([]);
		expect(hwInputArgs(pi, null)).toEqual([]);
	});
});

describe('accelFitsQuality', () => {
	it('sends plans beyond a 1080p encoder to software', () => {
		const pi: HwAccel = { encoder: 'v4l2m2m', maxWidth: 1920, label: '' };
		expect(accelFitsQuality(pi, auto)).toBe(true);
		expect(accelFitsQuality(pi, { ...auto, level: '5.2' })).toBe(false);
		expect(accelFitsQuality({ encoder: 'nvenc', label: '' }, { ...auto, level: '5.2' })).toBe(true);
	});
});

describe('rankRenderNodes', () => {
	it('puts dedicated GPUs first', () => {
		expect(rankRenderNodes([amdApu, amdCard]).map((n) => n.path)).toEqual([
			amdCard.path,
			amdApu.path
		]);
		expect(rankRenderNodes([intel, nvidia])[0]).toBe(nvidia);
		const second = { ...intel, path: '/dev/dri/renderD130' };
		expect(rankRenderNodes([second, intel]).map((n) => n.path)).toEqual([intel.path, second.path]);
	});
});

describe('hwCandidates', () => {
	it('tries NVENC, then VAAPI on AMD/Intel nodes, never VAAPI on NVIDIA', () => {
		const list = hwCandidates({ ...linux, nodes: [intel, nvidia], nvidia: true });
		expect(list.map((a) => [a.encoder, a.device, a.decode])).toEqual([
			['nvenc', undefined, 'cuda'],
			['vaapi', intel.path, 'vaapi']
		]);
	});

	it('prefers the AMD card over the APU', () => {
		const list = hwCandidates({ ...linux, nodes: [amdApu, amdCard] });
		expect(list.map((a) => a.device)).toEqual([amdCard.path, amdApu.path]);
		expect(list[0].label).toBe('VAAPI (AMD, /dev/dri/renderD129)');
	});

	it('honours FINDERELLA_HWACCEL and FINDERELLA_HWACCEL_DEVICE', () => {
		const env = { ...linux, nodes: [intel, nvidia], nvidia: true };
		expect(hwCandidates({ ...env, setting: '0' })).toEqual([]);
		expect(hwCandidates({ ...env, setting: 'off' })).toEqual([]);
		expect(hwCandidates({ ...env, setting: 'auto' })).toHaveLength(2);
		// Prefer the iGPU: the list reorders.
		expect(hwCandidates({ ...env, setting: 'vaapi,nvenc' }).map((a) => a.encoder)).toEqual([
			'vaapi',
			'nvenc'
		]);
		expect(hwCandidates({ ...env, setting: 'nvenc' }).map((a) => a.encoder)).toEqual(['nvenc']);
		expect(hwCandidates({ ...env, device: '1' })[0]).toMatchObject({
			encoder: 'nvenc',
			device: '1'
		});
		// A node path pins VAAPI to that node (and skips NVENC).
		expect(hwCandidates({ ...env, device: intel.path }).map((a) => a.encoder)).toEqual(['vaapi']);
	});

	it('uses the Pi 4 encoder up to 1080p and the HEVC decoder on a Pi 5', () => {
		const pi = { ...linux, arch: 'arm64', raspberryPi: true };
		const pi4 = hwCandidates({ ...pi, v4l2Encoder: true });
		expect(pi4[0]).toMatchObject({
			encoder: 'v4l2m2m',
			decode: 'drm',
			decodeCodecs: ['hevc'],
			maxWidth: 1920,
			bitrateOnly: true
		});
		expect(hwCandidates({ ...pi, v4l2Encoder: false })).toEqual([
			expect.objectContaining({ encoder: null, decode: 'drm', decodeCodecs: ['hevc'] })
		]);
		// A build without the drm hwaccel (upstream ffmpeg) can't decode HEVC on the Pi.
		expect(hwCandidates({ ...pi, hwaccels: [], v4l2Encoder: false })).toEqual([]);
	});

	it('tries NVENC → AMF → Quick Sync on Windows and VideoToolbox on macOS', () => {
		const win = hwCandidates({ ...linux, platform: 'win32', hwaccels: ['cuda', 'd3d11va'] });
		expect(win.map((a) => [a.encoder, a.decode])).toEqual([
			['nvenc', 'cuda'],
			['amf', 'd3d11va'],
			['qsv', 'd3d11va']
		]);
		const intelMac = hwCandidates({ ...linux, platform: 'darwin', hwaccels: ['videotoolbox'] });
		expect(intelMac).toEqual([
			expect.objectContaining({
				encoder: 'videotoolbox',
				decode: 'videotoolbox',
				bitrateOnly: true
			})
		]);
		const appleSilicon = hwCandidates({
			...linux,
			platform: 'darwin',
			arch: 'arm64',
			hwaccels: []
		});
		expect(appleSilicon[0]).toMatchObject({ bitrateOnly: false, decode: undefined });
	});
});

describe('judgeSelftest', () => {
	// ftyp … avcC: version 1, profile 100 (High), compat 0, level 41.
	const init = (profile: number, level: number) =>
		new Uint8Array([0, 0, 0, 8, 0x61, 0x76, 0x63, 0x43, 1, profile, 0, level, 0xff]);
	const playlist =
		'#EXTM3U\n#EXTINF:1.001,\nseg-0.m4s\n#EXTINF:1.001,\nseg-1.m4s\n#EXTINF:0.9,\nseg-2.m4s\n';

	it('reads profile and level from avcC', () => {
		expect(avcProfileLevel(init(100, 41))).toEqual([100, 41]);
		expect(avcProfileLevel(new Uint8Array([1, 2, 3]))).toBeNull();
	});

	it('passes a complete 8-bit High grid', () => {
		expect(
			judgeSelftest({ playlist, init: init(100, 41), expectedSegments: 3, maxLevel: 41 })
		).toEqual({ ok: true });
	});

	it('catches ignored forced keyframes, High 10, high levels and missing output', () => {
		const one = '#EXTM3U\n#EXTINF:3.0,\nseg-0.m4s\n';
		expect(
			judgeSelftest({ playlist: one, init: init(100, 41), expectedSegments: 3, maxLevel: 41 })
		).toMatchObject({ ok: false, reason: expect.stringContaining('forced keyframes') });
		expect(
			judgeSelftest({ playlist, init: init(110, 41), expectedSegments: 3, maxLevel: 41 })
		).toMatchObject({ ok: false, reason: 'H.264 profile 110, not High' });
		expect(
			judgeSelftest({ playlist, init: init(100, 51), expectedSegments: 3, maxLevel: 41 })
		).toMatchObject({ ok: false, reason: 'level 51 > 41' });
		expect(judgeSelftest({ playlist, init: null, expectedSegments: 3, maxLevel: 41 }).ok).toBe(
			false
		);
	});
});
