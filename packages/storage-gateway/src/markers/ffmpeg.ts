import { SAMPLE_RATE } from './fingerprint.js';

/**
 * ffmpeg argument builders for marker analysis. Both seek on the input
 * (`-ss` before `-i`), so only the requested window is read and decoded.
 */

function seconds(ms: number): string {
	return (ms / 1000).toFixed(3);
}

/** Decode one audio window to mono f32le PCM at the fingerprint rate on stdout. */
export function pcmArgs(opts: {
	absPath: string;
	streamIndex?: number;
	startMs: number;
	durationMs: number;
}): string[] {
	return [
		'-hide_banner',
		'-loglevel',
		'error',
		'-nostdin',
		'-ss',
		seconds(opts.startMs),
		'-t',
		seconds(opts.durationMs),
		'-i',
		opts.absPath,
		'-map',
		opts.streamIndex === undefined ? '0:a:0' : `0:${opts.streamIndex}`,
		'-vn',
		'-sn',
		'-dn',
		'-ac',
		'1',
		'-ar',
		String(SAMPLE_RATE),
		'-f',
		'f32le',
		'pipe:1'
	];
}

/**
 * Keyframes of one window, reduced to their luma plane, with the share of
 * black pixels printed per frame on stdout. Raw luma (not `format=gray`,
 * which stretches limited range to full and turns dark greys black) with a
 * threshold of 20 — just above video black at 16 — separates the true-black
 * background of rolling credits from dark scenes, identically across ffmpeg
 * builds. Keyframes only: rolling credits last
 * minutes, so a sample every few seconds is plenty and costs a fraction of
 * a full decode.
 */
export function darkframeArgs(opts: {
	absPath: string;
	startMs: number;
	durationMs: number;
}): string[] {
	return [
		'-hide_banner',
		'-loglevel',
		'error',
		'-nostdin',
		'-skip_frame',
		'nokey',
		'-ss',
		seconds(opts.startMs),
		'-t',
		seconds(opts.durationMs),
		'-i',
		opts.absPath,
		'-map',
		'0:v:0',
		'-an',
		'-sn',
		'-dn',
		'-vf',
		'extractplanes=y,scale=160:-2:flags=area,blackframe=amount=0:threshold=20,metadata=mode=print:key=lavfi.blackframe.pblack:file=-',
		'-fps_mode',
		'passthrough',
		'-f',
		'null',
		'-'
	];
}
