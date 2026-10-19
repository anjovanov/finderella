import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, readlink, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { transcodeDir } from '../config.js';
import { hlsArgs, type TranscodeQuality } from './ffmpeg.js';
import {
	HW_ENCODER_NAMES,
	hwCandidates,
	judgeSelftest,
	type HwAccel,
	type HwEnvironment,
	type RenderNode
} from './hwaccel.js';

const execFileAsync = promisify(execFile);

/** One self-test encode; a GPU that hangs (asleep, wedged driver) must not stall startup. */
const SELFTEST_TIMEOUT_MS = 20_000;
const SELFTEST_SECONDS = 3;
const SELFTEST_QUALITY: TranscodeQuality = { maxWidth: 1920, audioKbps: 128, level: '4.1' };
/** 10-bit input at a fractional rate: proves the 8-bit conversion and the keyframe grid. */
const SELFTEST_SOURCE = 'testsrc2=size=640x360:rate=24000/1001,format=yuv420p10le';

async function readTrimmed(path: string): Promise<string | null> {
	try {
		return (await readFile(path, 'utf8')).replace(/\0/g, '').trim();
	} catch {
		return null;
	}
}

async function linuxRenderNodes(): Promise<RenderNode[]> {
	let names: string[];
	try {
		names = (await readdir('/sys/class/drm')).filter((name) => /^renderD\d+$/.test(name));
	} catch {
		return [];
	}
	const nodes: RenderNode[] = [];
	for (const name of names) {
		const device = join('/sys/class/drm', name, 'device');
		const vendor = await readTrimmed(join(device, 'vendor'));
		const driver = await readlink(join(device, 'driver')).then(basename, () => '');
		const vram = Number(await readTrimmed(join(device, 'mem_info_vram_total')));
		nodes.push({
			path: `/dev/dri/${name}`,
			vendor: vendor ?? '',
			driver,
			vramBytes: Number.isFinite(vram) && vram > 0 ? vram : undefined
		});
	}
	return nodes;
}

/** A V4L2 memory-to-memory H.264 encoder (the Pi 4's `bcm2835-codec-encode`). */
async function hasV4l2Encoder(): Promise<boolean> {
	let names: string[];
	try {
		names = await readdir('/sys/class/video4linux');
	} catch {
		return false;
	}
	for (const name of names) {
		const label = await readTrimmed(join('/sys/class/video4linux', name, 'name'));
		if (label && /codec-encode/i.test(label)) return true;
	}
	return false;
}

/** What this machine has, for `hwCandidates`. */
export async function readHwEnvironment(hwaccels: readonly string[]): Promise<HwEnvironment> {
	const linux = process.platform === 'linux';
	const nodes = linux ? await linuxRenderNodes() : [];
	const model = linux ? await readTrimmed('/proc/device-tree/model') : null;
	const raspberryPi = !!model && model.includes('Raspberry Pi');
	return {
		platform: process.platform,
		arch: process.arch,
		nodes,
		nvidia: linux && (existsSync('/dev/nvidiactl') || nodes.some((n) => n.driver === 'nvidia')),
		raspberryPi,
		v4l2Encoder: raspberryPi && (await hasV4l2Encoder()),
		hwaccels,
		setting: process.env.FINDERELLA_HWACCEL || undefined,
		device: process.env.FINDERELLA_HWACCEL_DEVICE || undefined
	};
}

/** `ffmpeg -hwaccels`: the methods compiled in (not proof a device works). */
export async function listHwaccels(ffmpegBin: string): Promise<string[]> {
	try {
		const { stdout } = await execFileAsync(ffmpegBin, ['-hide_banner', '-hwaccels']);
		return stdout
			.split(/\r?\n/)
			.slice(1)
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

function lastLine(err: unknown): string {
	const e = err as { stderr?: string; killed?: boolean; message?: string };
	if (e.killed) return `timed out after ${SELFTEST_TIMEOUT_MS / 1000} s`;
	const lines = (e.stderr ?? e.message ?? '').trim().split(/\r?\n/).filter(Boolean);
	return lines.at(-1)?.slice(0, 300) ?? 'ffmpeg failed';
}

export interface HwDetection {
	/** The accelerator to use; null = software. */
	accel: HwAccel | null;
	/** Why the others were passed over, for the startup log. */
	rejected: string[];
}

/**
 * Pick the first accelerator that really works with this ffmpeg. "Compiled
 * in" proves nothing (a static build lists NVENC on machines without an
 * NVIDIA card, and AMD's VAAPI refuses rate-control modes Intel accepts), so
 * each candidate runs two short HLS encodes through the same `hlsArgs` the
 * sessions use: a 10-bit generated source uncapped, and a decoded H.264 file
 * with a bitrate cap. Both must produce every segment of the grid as 8-bit
 * H.264 High (`judgeSelftest`). When only the decoded run fails, the GPU
 * keeps encoding and decoding stays in software.
 */
export async function detectHwAccel(
	ffmpegBin: string,
	encoders: ReadonlySet<string>
): Promise<HwDetection> {
	const hwaccels = await listHwaccels(ffmpegBin);
	const env = await readHwEnvironment(hwaccels);
	const candidates = hwCandidates(env);
	const rejected: string[] = [];
	if (env.device?.startsWith('/') && !env.nodes.some((node) => node.path === env.device)) {
		rejected.push(`FINDERELLA_HWACCEL_DEVICE=${env.device} is not a render node on this machine`);
	}
	if (candidates.length === 0) return { accel: null, rejected };

	const work = join(transcodeDir(), `hwtest-${process.pid}-${Date.now()}`);
	let runs = 0;
	const run = async (accel: HwAccel, decoded: boolean): Promise<string | null> => {
		const dir = join(work, String(runs++));
		await mkdir(dir, { recursive: true });
		const args = hlsArgs({
			absPath: decoded ? join(work, 'sample.mp4') : SELFTEST_SOURCE,
			inputArgs: decoded ? undefined : ['-f', 'lavfi', '-t', String(SELFTEST_SECONDS)],
			dir,
			startSegment: 0,
			segmentSeconds: 1,
			quality: decoded ? { ...SELFTEST_QUALITY, maxVideoKbps: 3000 } : SELFTEST_QUALITY,
			hwaccel: decoded ? accel : { ...accel, decode: undefined },
			// Force the decode flag for codec-limited decoders; ffmpeg falls back for other codecs.
			sourceCodec: accel.decodeCodecs?.[0] ?? 'h264'
		});
		try {
			await execFileAsync(ffmpegBin, args, { timeout: SELFTEST_TIMEOUT_MS, killSignal: 'SIGKILL' });
		} catch (err) {
			return lastLine(err);
		}
		const verdict = judgeSelftest({
			playlist: await readFile(join(dir, 'playlist.m3u8'), 'utf8').catch(() => ''),
			init: await readFile(join(dir, 'init.mp4')).catch(() => null),
			expectedSegments: SELFTEST_SECONDS,
			maxLevel: 41
		});
		return verdict.ok ? null : verdict.reason;
	};

	try {
		await mkdir(work, { recursive: true });
		await execFileAsync(
			ffmpegBin,
			[
				'-hide_banner',
				'-loglevel',
				'error',
				'-y',
				'-f',
				'lavfi',
				'-i',
				'testsrc2=size=640x360:rate=24000/1001',
				'-t',
				String(SELFTEST_SECONDS),
				'-c:v',
				'libx264',
				'-preset',
				'ultrafast',
				'-pix_fmt',
				'yuv420p',
				join(work, 'sample.mp4')
			],
			{ timeout: SELFTEST_TIMEOUT_MS, killSignal: 'SIGKILL' }
		);

		for (const candidate of candidates) {
			if (candidate.encoder && !encoders.has(HW_ENCODER_NAMES[candidate.encoder])) {
				rejected.push(
					`${candidate.label}: this ffmpeg has no ${HW_ENCODER_NAMES[candidate.encoder]}`
				);
				continue;
			}
			if (candidate.encoder) {
				const encodeFailure = await run(candidate, false);
				if (encodeFailure) {
					rejected.push(`${candidate.label}: ${encodeFailure}`);
					continue;
				}
			}
			let accel = candidate;
			let decodeFailure = await run(accel, true);
			if (decodeFailure && accel.decode && accel.encoder) {
				const encodeOnly = { ...accel, decode: undefined, decodeCodecs: undefined };
				if ((await run(encodeOnly, true)) === null) {
					rejected.push(
						`${accel.label}: ${accel.decode} decoding failed (${decodeFailure}); decoding in software`
					);
					accel = encodeOnly;
					decodeFailure = null;
				}
			}
			if (decodeFailure) {
				rejected.push(`${accel.label}: ${decodeFailure}`);
				continue;
			}
			return { accel, rejected };
		}
		return { accel: null, rejected };
	} catch (err) {
		rejected.push(`self-test setup failed: ${lastLine(err)}`);
		return { accel: null, rejected };
	} finally {
		await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
			() => {}
		);
	}
}
