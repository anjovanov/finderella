import { isUtf8 } from 'node:buffer';

/**
 * Decode a sidecar subtitle file to text. Release subtitles are frequently
 * Windows-1252 / Latin-1 rather than UTF-8; invalid UTF-8 falls back to
 * windows-1252 (a superset of Latin-1 for the printable range). BOMs are
 * honoured and stripped.
 */
export function decodeSubtitleText(bytes: Uint8Array): string {
	if (bytes.length >= 2) {
		if (bytes[0] === 0xff && bytes[1] === 0xfe) {
			return new TextDecoder('utf-16le').decode(bytes.subarray(2));
		}
		if (bytes[0] === 0xfe && bytes[1] === 0xff) {
			return new TextDecoder('utf-16be').decode(bytes.subarray(2));
		}
	}
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		bytes = bytes.subarray(3);
	}
	const encoding = isUtf8(bytes) ? 'utf-8' : 'windows-1252';
	return new TextDecoder(encoding).decode(bytes);
}

const SRT_TIMING =
	/^\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})(.*)$/;

function vttTime(h: string, m: string, s: string, ms: string): string {
	return `${h.padStart(2, '0')}:${m}:${s}.${ms.padEnd(3, '0')}`;
}

/**
 * SubRip → WebVTT: header, `,` → `.` in timings, numeric cue ids dropped,
 * ASS-style `{\an8}` overrides stripped (WebVTT renders them literally).
 * Malformed blocks are skipped rather than failing the whole file.
 */
export function srtToVtt(srt: string): string {
	const blocks = srt.replace(/\r\n?/g, '\n').split(/\n{2,}/);
	const cues: string[] = [];
	for (const block of blocks) {
		const lines = block.split('\n').filter((line, i) => !(i === 0 && /^\s*\d+\s*$/.test(line)));
		if (lines.length === 0) continue;
		const timing = SRT_TIMING.exec(lines[0]);
		if (!timing) continue;
		const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = timing;
		const text = lines
			.slice(1)
			.map((line) => line.replace(/\{\\[^}]*\}/g, '').trimEnd())
			.join('\n')
			.trim();
		if (!text) continue;
		cues.push(`${vttTime(h1, m1, s1, ms1)} --> ${vttTime(h2, m2, s2, ms2)}\n${text}`);
	}
	return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

/** Normalize a WebVTT sidecar: line endings only; the header is left to the file. */
export function normalizeVtt(vtt: string): string {
	const text = vtt.replace(/\r\n?/g, '\n');
	return text.startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`;
}

export interface SubtitleArgsOptions {
	/** Video (embedded track) or a UTF-8 subtitle file (sidecar ass/ssa). */
	input: string;
	/** ffprobe's absolute stream index for an embedded track; omitted = first subtitle stream. */
	streamIndex?: number;
}

/**
 * ffmpeg arguments that write one subtitle track as WebVTT to stdout. Cues are
 * flushed as they're demuxed so the hub can stream them while a large
 * container is still being read.
 */
export function subtitleArgs(opts: SubtitleArgsOptions): string[] {
	return [
		'-nostdin',
		'-v',
		'error',
		'-i',
		opts.input,
		'-map',
		opts.streamIndex === undefined ? '0:s:0' : `0:${opts.streamIndex}`,
		'-c:s',
		'webvtt',
		'-f',
		'webvtt',
		'-flush_packets',
		'1',
		'pipe:1'
	];
}
