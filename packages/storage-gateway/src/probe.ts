import { execFile } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';
import type { GatewayCapabilities, ProbedFile } from '@finderella/protocol';
import { embeddedAudio, type FfprobeAudioStream } from './audio/embedded.js';
import { probedChapters, type FfprobeChapter } from './markers/chapters.js';
import { embeddedSubtitles, type FfprobeSubtitleStream } from './subtitles/embedded.js';
import {
	assessFfmpeg,
	parseComponentList,
	pickBestCandidate,
	type FfmpegAssessment
} from './tools.js';

const execFileAsync = promisify(execFile);

/**
 * Binary resolution. Candidates: explicit `FFMPEG_PATH` → system PATH →
 * bundled static build (ffmpeg-static / @ffprobe-installer). An explicit
 * override always wins; otherwise every candidate is feature-checked
 * (`assessFfmpeg`) and the most capable one is used, so a distro build that
 * lacks libx264 or `-fps_mode` loses to the bundled build. ffprobe comes from
 * the same source as ffmpeg when it can, so the two stay one release.
 */
let resolvedFfmpeg: string | null = null;
let resolvedFfprobe: string | null = null;
let hdrTonemap = false;

export function ffmpegPath(): string | null {
	return resolvedFfmpeg;
}

export function ffprobePath(): string | null {
	return resolvedFfprobe;
}

/** Whether the resolved ffmpeg has `zscale` + `tonemap`; without them HDR sources aren't tone-mapped. */
export function hdrTonemapAvailable(): boolean {
	return hdrTonemap;
}

/** First line of `<bin> -version`, or null when the binary doesn't run. */
async function versionLine(bin: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(bin, ['-version']);
		return stdout.split(/\r?\n/, 1)[0] ?? '';
	} catch {
		return null;
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
		// Throws when no build exists for this platform (optional dependency).
		const mod = await import('@ffprobe-installer/ffprobe');
		return (mod.default as { path?: string }).path ?? null;
	} catch {
		return null;
	}
}

/** `ffprobe` next to an ffmpeg given by path (keeps `.exe`); null for a bare PATH name. */
function siblingFfprobe(ffmpegBin: string): string | null {
	if (!/[\\/]/.test(ffmpegBin)) return null;
	return join(dirname(ffmpegBin), `ffprobe${extname(ffmpegBin)}`);
}

interface ToolSource {
	label: string;
	ffmpeg: string;
	ffprobe: string | null;
}

interface AssessedSource extends ToolSource {
	versionLine: string;
	assessment: FfmpegAssessment;
}

async function assessSource(source: ToolSource): Promise<AssessedSource | null> {
	const line = await versionLine(source.ffmpeg);
	if (line === null) return null;
	try {
		const [encoders, filters] = await Promise.all([
			execFileAsync(source.ffmpeg, ['-hide_banner', '-encoders']),
			execFileAsync(source.ffmpeg, ['-hide_banner', '-filters'])
		]);
		const assessment = assessFfmpeg({
			versionLine: line,
			encoders: parseComponentList(encoders.stdout),
			filters: parseComponentList(filters.stdout)
		});
		return { ...source, versionLine: line, assessment };
	} catch {
		return {
			...source,
			versionLine: line,
			assessment: { ok: false, missing: ['component listing'], hdrTonemap: false }
		};
	}
}

function describe(source: AssessedSource): string {
	const version = /version\s+(\S+)/.exec(source.versionLine)?.[1];
	return `${source.label} ffmpeg${version ? ` ${version}` : ''}`;
}

export interface ToolAvailability {
	capabilities: GatewayCapabilities;
	ffprobe: boolean;
	/** What was picked and why, for the startup log. */
	notes: string[];
}

/** Detect ffmpeg/ffprobe once at startup; reported to the hub in `hello`. */
export async function detectTools(): Promise<ToolAvailability> {
	const notes: string[] = [];
	const envFfmpeg = process.env.FFMPEG_PATH || undefined;
	const envFfprobe = process.env.FFPROBE_PATH || undefined;
	const [bundledFfmpeg, bundledFfprobe] = await Promise.all([staticFfmpeg(), staticFfprobe()]);

	const sources: ToolSource[] = [];
	if (envFfmpeg) {
		sources.push({ label: 'FFMPEG_PATH', ffmpeg: envFfmpeg, ffprobe: siblingFfprobe(envFfmpeg) });
	}
	sources.push({ label: 'system', ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });
	if (bundledFfmpeg) {
		sources.push({ label: 'bundled', ffmpeg: bundledFfmpeg, ffprobe: bundledFfprobe });
	}
	const assessed = (await Promise.all(sources.map(assessSource))).filter(
		(source): source is AssessedSource => source !== null
	);
	if (envFfmpeg && assessed[0]?.label !== 'FFMPEG_PATH') {
		notes.push(`FFMPEG_PATH=${envFfmpeg} does not run; ignoring it`);
	}
	// An explicit override is the operator's call, even when it lacks something.
	const chosen =
		assessed.find((source) => source.label === 'FFMPEG_PATH') ?? pickBestCandidate(assessed);
	for (const source of assessed) {
		if (source !== chosen && !source.assessment.ok) {
			notes.push(`${describe(source)} skipped: missing ${source.assessment.missing.join(', ')}`);
		}
	}
	if (chosen) {
		notes.push(`using ${describe(chosen)} (${chosen.ffmpeg})`);
		if (!chosen.assessment.ok) {
			notes.push(
				`WARNING: it lacks ${chosen.assessment.missing.join(', ')} — transcodes or marker analysis may fail; install a full ffmpeg build or set FFMPEG_PATH`
			);
		}
		if (!chosen.assessment.hdrTonemap) {
			notes.push('no zscale/tonemap filters: HDR sources will play without tone-mapping');
		}
	}
	resolvedFfmpeg = chosen?.ffmpeg ?? null;
	hdrTonemap = chosen?.assessment.hdrTonemap ?? false;

	// ffprobe: explicit override, then the chosen source's own, then any other.
	const probeCandidates = [
		envFfprobe,
		chosen?.ffprobe,
		...sources.filter((source) => source !== chosen).map((source) => source.ffprobe)
	].filter((bin, i, all): bin is string => !!bin && all.indexOf(bin) === i);
	resolvedFfprobe = null;
	for (const bin of probeCandidates) {
		if ((await versionLine(bin)) !== null) {
			resolvedFfprobe = bin;
			break;
		}
	}
	if (resolvedFfprobe) notes.push(`using ffprobe ${resolvedFfprobe}`);

	let ffmpegVersion: string | undefined;
	let hwaccels: string[] = [];
	if (chosen) {
		ffmpegVersion = /ffmpeg version (\S+)/.exec(chosen.versionLine)?.[1];
		try {
			const hw = await execFileAsync(chosen.ffmpeg, ['-hide_banner', '-hwaccels']);
			hwaccels = hw.stdout
				.split(/\r?\n/)
				.slice(1)
				.map((line) => line.trim())
				.filter(Boolean);
		} catch {
			// best-effort
		}
	}

	return {
		capabilities: {
			ffmpeg: resolvedFfmpeg !== null,
			ffmpegVersion,
			hwaccels,
			// srt/vtt sidecars convert in-process; ass and embedded tracks need ffmpeg (checked per request).
			subtitles: true,
			subtitleWrite: true,
			// Sprite sheets need both tools; FINDERELLA_TRICKPLAY=0 opts a weak device out.
			trickplay:
				resolvedFfmpeg !== null &&
				resolvedFfprobe !== null &&
				process.env.FINDERELLA_TRICKPLAY !== '0',
			// Picking the audio stream only matters for HLS transcodes.
			audioSelect: resolvedFfmpeg !== null,
			// Intro/credits analysis only decodes with ffmpeg; FINDERELLA_MARKERS=0 opts a weak device out.
			markers: resolvedFfmpeg !== null && process.env.FINDERELLA_MARKERS !== '0',
			// Recursive fs.watch on the library roots; FINDERELLA_WATCH=0 opts out.
			watch: process.env.FINDERELLA_WATCH !== '0'
		},
		ffprobe: resolvedFfprobe !== null,
		notes
	};
}

interface FfprobeStream extends FfprobeSubtitleStream {
	channels?: number;
	width?: number;
	height?: number;
}

interface FfprobeOutput {
	streams?: FfprobeStream[];
	format?: { duration?: string; bit_rate?: string };
	chapters?: FfprobeChapter[];
}

/** HDR transfer characteristics (PQ / HLG) that need tone-mapping for an SDR output. */
export function isHdrTransfer(transfer: string | null | undefined): boolean {
	return transfer === 'smpte2084' || transfer === 'arib-std-b67';
}

/** `color_transfer` of the first video stream, or null when unknown / no ffprobe. */
export async function probeColorTransfer(absPath: string): Promise<string | null> {
	const bin = resolvedFfprobe;
	if (!bin) return null;
	try {
		const { stdout } = await execFileAsync(bin, [
			'-v',
			'error',
			'-select_streams',
			'v:0',
			'-show_entries',
			'stream=color_transfer',
			'-of',
			'csv=p=0',
			absPath
		]);
		const value = stdout.trim();
		return value && value !== 'unknown' ? value : null;
	} catch {
		return null;
	}
}

export interface TrickplaySourceInfo {
	width: number;
	height: number;
	/** ffprobe ratio strings (`16:9`); absent when unknown. */
	sar?: string;
	dar?: string;
	/** Display-matrix rotation in degrees (±90 swaps the display aspect). */
	rotation?: number;
	durationMs: number;
	hdr: boolean;
}

interface FfprobeGeometryOutput {
	streams?: {
		width?: number;
		height?: number;
		sample_aspect_ratio?: string;
		display_aspect_ratio?: string;
		color_transfer?: string;
		side_data_list?: { rotation?: number }[];
	}[];
	format?: { duration?: string };
}

/**
 * Everything the trickplay planner needs from the first video stream in one
 * ffprobe call: coded size, aspect ratios (anamorphic sources scale by
 * display aspect, not pixels), rotation, duration and the HDR flag.
 */
export async function probeTrickplaySource(absPath: string): Promise<TrickplaySourceInfo | null> {
	const bin = resolvedFfprobe;
	if (!bin) return null;
	try {
		const { stdout } = await execFileAsync(bin, [
			'-v',
			'error',
			'-select_streams',
			'v:0',
			// Whole sections, not `-show_entries …:stream_side_data=rotation`: ffprobe
			// before 5.x has no `stream_side_data` section and rejects the whole call
			// (the bundled Apple Silicon ffprobe is 4.4).
			'-show_streams',
			'-show_format',
			'-of',
			'json',
			absPath
		]);
		const parsed = JSON.parse(stdout) as FfprobeGeometryOutput;
		const video = parsed.streams?.[0];
		const durationSec = Number(parsed.format?.duration);
		if (!video?.width || !video.height || !Number.isFinite(durationSec)) return null;
		const rotation = video.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation;
		return {
			width: video.width,
			height: video.height,
			sar: video.sample_aspect_ratio,
			dar: video.display_aspect_ratio,
			rotation,
			durationMs: Math.round(durationSec * 1000),
			hdr: isHdrTransfer(video.color_transfer)
		};
	} catch {
		return null;
	}
}

/** Extract the fields the hub cares about; returns {} when probing fails. */
export async function probeFile(
	absPath: string
): Promise<
	Partial<
		Pick<
			ProbedFile,
			| 'videoCodec'
			| 'audioCodec'
			| 'width'
			| 'height'
			| 'durationMs'
			| 'bitrate'
			| 'subtitles'
			| 'audioTracks'
			| 'chapters'
		>
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
			'-show_chapters',
			absPath
		]);
		const parsed = JSON.parse(stdout) as FfprobeOutput;
		const video = parsed.streams?.find((s) => s.codec_type === 'video');
		const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
		const durationSec = Number(parsed.format?.duration);
		const bitrate = Number(parsed.format?.bit_rate);
		const subtitles = embeddedSubtitles(parsed.streams);
		return {
			videoCodec: video?.codec_name,
			audioCodec: audio?.codec_name,
			width: video?.width,
			height: video?.height,
			durationMs: Number.isFinite(durationSec) ? Math.round(durationSec * 1000) : undefined,
			bitrate: Number.isFinite(bitrate) ? bitrate : undefined,
			subtitles: subtitles.length > 0 ? subtitles : undefined,
			// Always an array once ffprobe answered, so a file that lost its tracks clears the hub's rows.
			audioTracks: embeddedAudio(parsed.streams as FfprobeAudioStream[] | undefined),
			// Same for chapters: a remux that dropped them clears the hub's chapter markers.
			chapters: probedChapters(parsed.chapters)
		};
	} catch {
		return {};
	}
}
