import { join } from 'node:path';
import type { TrickplayGeometry } from '@finderella/protocol';
import { HDR_TONEMAP_FILTERS } from '../transcode/ffmpeg.js';

export interface TrickplayJobOptions {
	absPath: string;
	/** Cache entry dir the sheets are written into. */
	dir: string;
	geometry: TrickplayGeometry;
	/** Source is HDR (PQ/HLG): tone-map so the tiles aren't grey. */
	hdr?: boolean;
}

/** Sheet file name for index `n` (matches the `%03d` pattern below). */
export function sheetFileName(n: number): string {
	return `sheet-${String(n).padStart(3, '0')}.jpg`;
}

/** Extra tiles cloned from the last one so the final slot(s) exist even after a long last GOP. */
export const TRICKPLAY_TAIL_CLONES = 3;

/**
 * ffmpeg argv for one sprite-sheet run. `-skip_frame nokey` (a decoder
 * option, so before `-i`) decodes keyframes only — an order of magnitude
 * faster than a full decode; `fps` then picks the nearest one per 10 s slot,
 * so a tile can sit up to half a GOP off its time, which previews tolerate.
 * `fps` emits round(duration / interval) frames and, with keyframes only,
 * "duration" ends at the last keyframe — so the last slot the hub predicts
 * (ceil) can be missing. `tpad` clones the last tile a few times to cover
 * that (GOPs up to ~15 s) and `-frames:v` caps the run at the predicted sheet
 * count so the clones never add a sheet the hub doesn't expect; surplus tiles
 * on the last sheet are simply never referenced. The tile size is explicit
 * (computed from the display aspect — `scale=W:-2` would squash anamorphic
 * sources). `tile` flushes the last partial grid at EOF padded with black.
 * The image2 muxer writes each sheet to a temp name and renames it, so a
 * sheet that exists is complete; mjpeg wants a full-range 8-bit picture,
 * hence the pix_fmt pin (10-bit HEVC otherwise negotiates oddly across
 * ffmpeg versions).
 */
export function trickplayArgs(opts: TrickplayJobOptions): string[] {
	const g = opts.geometry;
	const filters = [
		`fps=1/${g.interval}:start_time=0`,
		`tpad=stop=${TRICKPLAY_TAIL_CLONES}:stop_mode=clone`,
		`scale=${g.tileWidth}:${g.tileHeight}`,
		'setsar=1',
		...(opts.hdr ? [HDR_TONEMAP_FILTERS] : []),
		`tile=${g.columns}x${g.rows}`
	];
	return [
		'-hide_banner',
		'-loglevel',
		'error',
		'-nostdin',
		'-y',
		'-skip_frame',
		'nokey',
		'-i',
		opts.absPath,
		'-an',
		'-sn',
		'-dn',
		'-map',
		'0:v:0',
		'-vf',
		filters.join(','),
		'-frames:v',
		String(g.sheets),
		'-pix_fmt',
		'yuvj420p',
		'-q:v',
		'5',
		'-f',
		'image2',
		'-atomic_writing',
		'1',
		'-start_number',
		'0',
		join(opts.dir, 'sheet-%03d.jpg')
	];
}
