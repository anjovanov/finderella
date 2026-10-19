/**
 * Hardware-accelerated HLS transcoding: pure argv pieces, device ranking and
 * the self-test verdict. Detection (which of these actually works on this
 * machine) lives in hwaccel-detect.ts.
 *
 * Pipeline: decode on the GPU with frames copied back to system memory, scale
 * and tone-map on the CPU (the same filters as the software path), encode on
 * the GPU. Copying back costs bandwidth but keeps one filter chain for every
 * backend, and a codec the GPU can't decode falls back to software decoding
 * inside ffmpeg instead of failing.
 */
import type { TranscodeQuality } from './ffmpeg.js';

export type HwBackend = 'nvenc' | 'qsv' | 'amf' | 'vaapi' | 'videotoolbox' | 'v4l2m2m';
export type HwDecode = 'cuda' | 'vaapi' | 'd3d11va' | 'videotoolbox' | 'drm';

export const HW_BACKENDS: readonly HwBackend[] = [
	'nvenc',
	'qsv',
	'amf',
	'vaapi',
	'videotoolbox',
	'v4l2m2m'
];

/** The ffmpeg encoder each backend drives. */
export const HW_ENCODER_NAMES: Record<HwBackend, string> = {
	nvenc: 'h264_nvenc',
	qsv: 'h264_qsv',
	amf: 'h264_amf',
	vaapi: 'h264_vaapi',
	videotoolbox: 'h264_videotoolbox',
	v4l2m2m: 'h264_v4l2m2m'
};

export interface HwAccel {
	/** Hardware H.264 encoder; null = libx264 with hardware decoding only. */
	encoder: HwBackend | null;
	/** VAAPI render node (`/dev/dri/renderD128`) or NVENC GPU index (`1`). */
	device?: string;
	/** `-hwaccel` method; absent = software decoding. */
	decode?: HwDecode;
	/** Source codecs (ffprobe names) to decode in hardware; absent = all (ffmpeg falls back per codec). */
	decodeCodecs?: readonly string[];
	/** Widest output the encoder handles; wider plans transcode in software. */
	maxWidth?: number;
	/** Encoder has no constant-quality mode: always give it a bitrate. */
	bitrateOnly?: boolean;
	/** Human-readable name for logs and the admin device card. */
	label: string;
}

/** VBR target as a share of the plan's cap, for encoders without a quality-plus-ceiling mode. */
export const HW_VBR_TARGET = 0.65;

/** CRF-equivalent quality for the hardware encoders' constant-quality modes. */
export const HW_QUALITY = 23;

/**
 * GOP length for hardware encoders. Long on purpose: the segment grid must
 * come from `-force_key_frames` alone, and with a short GOP an encoder that
 * ignores forced keyframes would still split near the grid and pass the
 * self-test (a 12-frame GOP keyframes every 0.5 s).
 */
export const HW_GOP_FRAMES = 1200;

/** VideoToolbox's `-q:v` (1–100) is only implemented on Apple Silicon. */
export const VIDEOTOOLBOX_QUALITY = 65;

/** Target for bitrate-only encoders without a plan cap (≈ what CRF 23 averages). */
export function defaultVideoKbps(width: number): number {
	if (width <= 1280) return 4000;
	if (width <= 1920) return 8000;
	if (width <= 2560) return 14000;
	return 25000;
}

/** Whether a plan's output fits the accelerator; a 4K plan on a 1080p-only encoder goes to software. */
export function accelFitsQuality(accel: HwAccel, quality: TranscodeQuality): boolean {
	return accel.maxWidth === undefined || quality.level === '4.1';
}

/** Input-side flags (before `-i`): device setup and the decode method. */
export function hwInputArgs(accel: HwAccel, sourceCodec?: string | null): string[] {
	const args: string[] = [];
	if (accel.encoder === 'vaapi' || accel.decode === 'vaapi') {
		args.push('-init_hw_device', `vaapi=gpu:${accel.device ?? ''}`, '-filter_hw_device', 'gpu');
	}
	const decodeThis =
		accel.decode !== undefined &&
		(!accel.decodeCodecs || (!!sourceCodec && accel.decodeCodecs.includes(sourceCodec)));
	if (!decodeThis) return args;
	args.push('-hwaccel', accel.decode!);
	if (accel.decode === 'vaapi') args.push('-hwaccel_device', 'gpu');
	else if (accel.decode === 'cuda' && accel.device) args.push('-hwaccel_device', accel.device);
	return args;
}

/** Filters appended after scale/tone-map: the pixel format the encoder takes, uploaded for VAAPI. */
export function hwFilterTail(encoder: HwBackend): string[] {
	switch (encoder) {
		case 'vaapi':
			return ['format=nv12', 'hwupload'];
		case 'qsv':
			return ['format=nv12'];
		default:
			return ['format=yuv420p'];
	}
}

/**
 * Video encoder flags, replacing libx264's `-c:v … -pix_fmt yuv420p`. Every
 * backend keeps the HLS contract: 8-bit H.264 High at the plan's level, a VBV
 * cap when the plan has one (VBR at `HW_VBR_TARGET` of the cap), constant quality
 * otherwise. Forced keyframes become IDR frames where the encoder needs to be
 * told. Flags whose behaviour differs between drivers are proven by the
 * detection self-test, not trusted.
 */
export function hwVideoArgs(accel: HwAccel, quality: TranscodeQuality): string[] {
	const encoder = accel.encoder;
	if (!encoder) throw new Error('hwVideoArgs needs a hardware encoder');
	const cap = quality.maxVideoKbps;
	const capped = cap
		? [
				'-b:v',
				`${Math.round(cap * HW_VBR_TARGET)}k`,
				'-maxrate',
				`${cap}k`,
				'-bufsize',
				`${cap * 2}k`
			]
		: [];
	const q = String(HW_QUALITY);
	const args = ['-c:v', HW_ENCODER_NAMES[encoder]];
	switch (encoder) {
		case 'nvenc':
			if (accel.device) args.push('-gpu', accel.device);
			args.push('-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-cq', q, '-b:v', '0');
			if (cap) args.push('-maxrate', `${cap}k`, '-bufsize', `${cap * 2}k`);
			args.push('-forced-idr', '1');
			break;
		case 'vaapi':
			// QVBR/ICQ are Intel-only (AMD refuses QVBR without a bitrate); CQP and VBR work on both.
			args.push(...(cap ? ['-rc_mode', 'VBR', ...capped] : ['-rc_mode', 'CQP', '-qp', q]));
			break;
		case 'qsv':
			args.push('-preset', 'veryfast', ...(cap ? capped : ['-global_quality', q]));
			args.push('-forced_idr', '1');
			break;
		case 'amf':
			args.push('-usage', 'transcoding', '-quality', 'balanced');
			args.push(
				...(cap
					? ['-rc', 'vbr_peak', ...capped]
					: ['-rc', 'cqp', '-qp_i', q, '-qp_p', q, '-qp_b', q])
			);
			args.push('-forced_idr', '1');
			break;
		case 'videotoolbox':
			args.push('-allow_sw', '0');
			if (cap) args.push(...capped);
			else if (accel.bitrateOnly) args.push('-b:v', `${defaultVideoKbps(quality.maxWidth)}k`);
			else args.push('-q:v', String(VIDEOTOOLBOX_QUALITY));
			break;
		case 'v4l2m2m':
			args.push(
				'-b:v',
				`${cap ? Math.round(cap * HW_VBR_TARGET) : defaultVideoKbps(quality.maxWidth)}k`
			);
			break;
	}
	args.push('-g', String(HW_GOP_FRAMES));
	// h264_qsv and h264_v4l2m2m read the generic AVCodecContext profile/level,
	// which takes numbers (High = 100, 4.1 = 41); the others name them.
	const numeric = encoder === 'qsv' || encoder === 'v4l2m2m';
	args.push(
		'-profile:v',
		encoder === 'v4l2m2m' ? '100' : 'high',
		'-level',
		numeric ? quality.level.replace('.', '') : quality.level
	);
	if (encoder !== 'vaapi') args.push('-pix_fmt', encoder === 'qsv' ? 'nv12' : 'yuv420p');
	return args;
}

/* ---------- device ranking & candidate order ---------- */

export interface RenderNode {
	/** `/dev/dri/renderD128` */
	path: string;
	/** PCI vendor id from sysfs (`0x1002`). */
	vendor: string;
	/** Kernel driver (`amdgpu`, `i915`, `xe`, `nvidia`, `v3d`, …). */
	driver: string;
	/** amdgpu's `mem_info_vram_total`; absent elsewhere. */
	vramBytes?: number;
}

const NVIDIA = '0x10de';
const AMD = '0x1002';
const INTEL = '0x8086';
const VENDOR_NAMES: Record<string, string> = { [NVIDIA]: 'NVIDIA', [AMD]: 'AMD', [INTEL]: 'Intel' };
/** APUs carve out at most a couple of GiB; a dedicated card has more. */
const DISCRETE_VRAM_BYTES = 4 * 1024 ** 3;

function isDiscrete(node: RenderNode): boolean {
	return node.vendor === NVIDIA || (node.vramBytes ?? 0) >= DISCRETE_VRAM_BYTES;
}

/** Dedicated GPUs first, then larger VRAM, then node order (stable). */
export function rankRenderNodes(nodes: readonly RenderNode[]): RenderNode[] {
	return [...nodes].sort(
		(a, b) =>
			Number(isDiscrete(b)) - Number(isDiscrete(a)) ||
			(b.vramBytes ?? 0) - (a.vramBytes ?? 0) ||
			a.path.localeCompare(b.path, 'en', { numeric: true })
	);
}

export interface HwEnvironment {
	platform: NodeJS.Platform;
	arch: string;
	/** Linux render nodes from sysfs. */
	nodes: readonly RenderNode[];
	/** The proprietary NVIDIA driver is loaded (`/dev/nvidiactl`, or an `nvidia` render node). */
	nvidia: boolean;
	/** `/proc/device-tree/model` says Raspberry Pi. */
	raspberryPi: boolean;
	/** The Pi's V4L2 H.264 encoder (`/dev/video11`, Pi 4 and older; the Pi 5 has none). */
	v4l2Encoder: boolean;
	/** `ffmpeg -hwaccels` of the build being assessed. */
	hwaccels: readonly string[];
	/** `FINDERELLA_HWACCEL`: `0`/`off`, or backends in preference order (`vaapi,nvenc`). */
	setting?: string;
	/** `FINDERELLA_HWACCEL_DEVICE`: a render node path or an NVIDIA GPU index. */
	device?: string;
}

/** `FINDERELLA_HWACCEL` turns acceleration off. */
export function hwaccelDisabled(setting: string | undefined): boolean {
	return setting !== undefined && ['0', 'off', 'none', 'false', 'cpu'].includes(setting.trim());
}

/**
 * Accelerators to self-test, best first. The dedicated GPU wins on hybrid
 * machines: NVENC before any VAAPI node, VAAPI nodes by `rankRenderNodes`,
 * and on Windows NVENC → AMF → Quick Sync (an Intel iGPU is the one most
 * likely to sit next to a dedicated card). Linux uses VAAPI for both AMD and
 * Intel (no extra runtime to install); NVIDIA's VAAPI shim decodes only, so
 * NVIDIA nodes never become VAAPI candidates. A Raspberry Pi 5 has no H.264
 * encoder, only HEVC decoding — that's the decode-only candidate.
 */
export function hwCandidates(env: HwEnvironment): HwAccel[] {
	if (hwaccelDisabled(env.setting)) return [];
	const has = (method: HwDecode) => env.hwaccels.includes(method);
	const nvidiaIndex = env.device && /^\d+$/.test(env.device) ? env.device : undefined;
	const nodePath = env.device?.startsWith('/') ? env.device : undefined;
	const all: HwAccel[] = [];

	if (env.platform === 'linux') {
		if (env.nvidia && !nodePath) {
			all.push({
				encoder: 'nvenc',
				device: nvidiaIndex,
				decode: has('cuda') ? 'cuda' : undefined,
				label: nvidiaIndex ? `NVIDIA NVENC (GPU ${nvidiaIndex})` : 'NVIDIA NVENC'
			});
		}
		const nodes = rankRenderNodes(
			env.nodes.filter(
				(node) =>
					(node.vendor === AMD || node.vendor === INTEL) && (!nodePath || node.path === nodePath)
			)
		);
		for (const node of nodes) {
			all.push({
				encoder: 'vaapi',
				device: node.path,
				decode: has('vaapi') ? 'vaapi' : undefined,
				label: `VAAPI (${VENDOR_NAMES[node.vendor]}, ${node.path})`
			});
		}
		if (env.raspberryPi) {
			const drm = has('drm') ? { decode: 'drm' as const, decodeCodecs: ['hevc'] } : {};
			if (env.v4l2Encoder) {
				all.push({
					encoder: 'v4l2m2m',
					...drm,
					maxWidth: 1920,
					bitrateOnly: true,
					label: 'Raspberry Pi V4L2 encoder'
				});
			}
			if (drm.decode) all.push({ encoder: null, ...drm, label: 'Raspberry Pi HEVC decoder' });
		}
	} else if (env.platform === 'win32') {
		const d3d11 = has('d3d11va') ? ('d3d11va' as const) : undefined;
		all.push(
			{
				encoder: 'nvenc',
				device: nvidiaIndex,
				decode: has('cuda') ? 'cuda' : d3d11,
				label: nvidiaIndex ? `NVIDIA NVENC (GPU ${nvidiaIndex})` : 'NVIDIA NVENC'
			},
			{ encoder: 'amf', decode: d3d11, label: 'AMD AMF' },
			{ encoder: 'qsv', decode: d3d11, label: 'Intel Quick Sync' }
		);
	} else if (env.platform === 'darwin') {
		all.push({
			encoder: 'videotoolbox',
			decode: has('videotoolbox') ? 'videotoolbox' : undefined,
			bitrateOnly: env.arch !== 'arm64',
			label: 'Apple VideoToolbox'
		});
	}

	const wanted = parseHwSetting(env.setting);
	if (!wanted) return all;
	// An explicit list filters and reorders (`vaapi,nvenc` = prefer the iGPU).
	return wanted.flatMap((backend) => all.filter((accel) => accel.encoder === backend));
}

function parseHwSetting(setting: string | undefined): HwBackend[] | null {
	if (!setting || setting.trim() === '' || setting.trim() === 'auto') return null;
	const names = setting
		.split(',')
		.map((name) => name.trim().toLowerCase())
		.filter((name): name is HwBackend => (HW_BACKENDS as readonly string[]).includes(name));
	return names.length > 0 ? names : null;
}

/* ---------- self-test verdict ---------- */

/** `[profile_idc, level_idc]` from the first `avcC` box of an init segment, or null. */
export function avcProfileLevel(init: Uint8Array): [number, number] | null {
	for (let i = 0; i + 8 <= init.length; i++) {
		// 'avcC' then configurationVersion(1) AVCProfileIndication compat AVCLevelIndication
		if (init[i] === 0x61 && init[i + 1] === 0x76 && init[i + 2] === 0x63 && init[i + 3] === 0x43) {
			if (init[i + 4] !== 1) return null;
			return [init[i + 5], init[i + 7]];
		}
	}
	return null;
}

/** H.264 High (8-bit 4:2:0 only — High 10 is 110). */
const PROFILE_HIGH = 100;

/**
 * Did a self-test run produce what the hub's playlist promises? Every
 * segment of the grid (proves forced keyframes with a long GOP), H.264 High
 * (8-bit 4:2:0) at or below the planned level.
 */
export function judgeSelftest(input: {
	playlist: string;
	init: Uint8Array | null;
	expectedSegments: number;
	maxLevel: number;
}): { ok: true } | { ok: false; reason: string } {
	const segments = [...input.playlist.matchAll(/^seg-\d+\.m4s\r?$/gm)].length;
	if (segments !== input.expectedSegments) {
		return {
			ok: false,
			reason: `${segments} of ${input.expectedSegments} segments (forced keyframes not honoured)`
		};
	}
	const avc = input.init ? avcProfileLevel(input.init) : null;
	if (!avc) return { ok: false, reason: 'no H.264 stream in the output' };
	const [profile, level] = avc;
	if (profile !== PROFILE_HIGH) return { ok: false, reason: `H.264 profile ${profile}, not High` };
	if (level > input.maxLevel) return { ok: false, reason: `level ${level} > ${input.maxLevel}` };
	return { ok: true };
}
