import { posix } from 'node:path';

/**
 * Where a downloaded subtitle goes: beside the video as
 * `<video stem>.<lang>[.hi][.<n>].<ext>`. The scanner's sidecar matcher reads
 * exactly this back (`hi` → SDH, a bare number is ignored), so the file
 * survives rescans as the same track.
 */
export function sidecarRelPath(
	videoRelPath: string,
	opts: { language: string; hearingImpaired: boolean; format: string; attempt?: number }
): string {
	const dir = posix.dirname(videoRelPath);
	const base = posix.basename(videoRelPath);
	const stem = base.slice(0, base.length - posix.extname(base).length);
	const parts = [stem, opts.language];
	if (opts.hearingImpaired) parts.push('hi');
	if (opts.attempt && opts.attempt > 1) parts.push(String(opts.attempt));
	parts.push(opts.format);
	const name = parts.join('.');
	return dir === '.' ? name : `${dir}/${name}`;
}
