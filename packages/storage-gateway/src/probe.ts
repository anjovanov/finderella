import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GatewayCapabilities, ProbedFile } from '@finderella/protocol';

const execFileAsync = promisify(execFile);

/**
 * Binary resolution: explicit env override → system PATH → bundled static
 * build (ffmpeg-static / ffprobe-static). System builds are preferred when
 * present — NAS/desktop ffmpeg often has hardware acceleration the static
 * build lacks.
 */
let resolvedFfmpeg: string | null = null;
let resolvedFfprobe: string | null = null;

export function ffmpegPath(): string | null {
	return resolvedFfmpeg;
}

export function ffprobePath(): string | null {
	return resolvedFfprobe;
}

async function works(bin: string): Promise<boolean> {
	try {
		await execFileAsync(bin, ['-version']);
		return true;
	} catch {
		return false;
	}
}

async function staticFfmpeg(): Promise<string | null> {
	try {
		const mod = await import('ffmpeg-static');
		return (mod.default as unknown as string) ?? null;
	} catch {
		return null;
	}
}

async function staticFfprobe(): Promise<string | null> {
	try {
		const mod = await import('ffprobe-static');
		return (mod.default as { path?: string }).path ?? null;
	} catch {
		return null;
	}
}

async function resolveBin(
	envValue: string | undefined,
	systemName: string,
	staticResolver: () => Promise<string | null>
): Promise<string | null> {
	if (envValue && (await works(envValue))) return envValue;
	if (await works(systemName)) return systemName;
	const bundled = await staticResolver();
	if (bundled && (await works(bundled))) return bundled;
	return null;
}

export interface ToolAvailability {
	capabilities: GatewayCapabilities;
	ffprobe: boolean;
}

/** Detect ffmpeg/ffprobe once at startup; reported to the hub in `hello`. */
export async function detectTools(): Promise<ToolAvailability> {
	resolvedFfmpeg = await resolveBin(process.env.FFMPEG_PATH, 'ffmpeg', staticFfmpeg);
	resolvedFfprobe = await resolveBin(process.env.FFPROBE_PATH, 'ffprobe', staticFfprobe);

	let ffmpegVersion: string | undefined;
	let hwaccels: string[] = [];
	if (resolvedFfmpeg) {
		try {
			const { stdout } = await execFileAsync(resolvedFfmpeg, ['-version']);
			ffmpegVersion = /ffmpeg version (\S+)/.exec(stdout)?.[1];
			const hw = await execFileAsync(resolvedFfmpeg, ['-hide_banner', '-hwaccels']);
			hwaccels = hw.stdout
				.split('\n')
				.slice(1)
				.map((line) => line.trim())
				.filter(Boolean);
		} catch {
			// version parse is best-effort
		}
	}

	return {
		capabilities: { ffmpeg: resolvedFfmpeg !== null, ffmpegVersion, hwaccels },
		ffprobe: resolvedFfprobe !== null
	};
}

interface FfprobeStream {
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
}

interface FfprobeOutput {
	streams?: FfprobeStream[];
	format?: { duration?: string; bit_rate?: string };
}

/** Extract the fields the hub cares about; returns {} when probing fails. */
export async function probeFile(
	absPath: string
): Promise<
	Partial<
		Pick<ProbedFile, 'videoCodec' | 'audioCodec' | 'width' | 'height' | 'durationMs' | 'bitrate'>
	>
> {
	const bin = resolvedFfprobe;
	if (!bin) return {};
	try {
		const { stdout } = await execFileAsync(bin, [
			'-v',
			'error',
			'-print_format',
			'json',
			'-show_format',
			'-show_streams',
			absPath
		]);
		const parsed = JSON.parse(stdout) as FfprobeOutput;
		const video = parsed.streams?.find((s) => s.codec_type === 'video');
		const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
		const durationSec = Number(parsed.format?.duration);
		const bitrate = Number(parsed.format?.bit_rate);
		return {
			videoCodec: video?.codec_name,
			audioCodec: audio?.codec_name,
			width: video?.width,
			height: video?.height,
			durationMs: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : undefined,
			bitrate: Number.isFinite(bitrate) ? bitrate : undefined
		};
	} catch {
		return {};
	}
}
