import { describe, expect, it } from 'vitest';
import type { TrickplayGeometry } from '@finderella/protocol';
import { HDR_TONEMAP_FILTERS } from '../transcode/ffmpeg.js';
import { sheetFileName, trickplayArgs } from './ffmpeg.js';

const geometry: TrickplayGeometry = {
	version: 1,
	interval: 10,
	tileWidth: 320,
	tileHeight: 180,
	columns: 10,
	rows: 10,
	tiles: 720,
	sheets: 8
};
const base = { absPath: '/media/movie.mkv', dir: '/cache/abc', geometry };

function valueAfter(args: string[], flag: string): string | undefined {
	const i = args.indexOf(flag);
	return i === -1 ? undefined : args[i + 1];
}

describe('trickplayArgs', () => {
	it('decodes keyframes only and tiles the explicit display size', () => {
		const args = trickplayArgs(base);
		expect(args.indexOf('-skip_frame')).toBeLessThan(args.indexOf('-i'));
		expect(valueAfter(args, '-skip_frame')).toBe('nokey');
		expect(valueAfter(args, '-i')).toBe('/media/movie.mkv');
		expect(valueAfter(args, '-vf')).toBe(
			'fps=1/10:start_time=0,tpad=stop=3:stop_mode=clone,scale=320:180,setsar=1,tile=10x10'
		);
		expect(valueAfter(args, '-frames:v')).toBe('8');
		expect(valueAfter(args, '-map')).toBe('0:v:0');
		expect(args).toContain('-an');
		expect(args).toContain('-sn');
	});

	it('writes atomic, zero-based JPEG sheets into the cache dir', () => {
		const args = trickplayArgs(base);
		expect(valueAfter(args, '-pix_fmt')).toBe('yuvj420p');
		expect(valueAfter(args, '-q:v')).toBe('5');
		expect(valueAfter(args, '-f')).toBe('image2');
		expect(valueAfter(args, '-atomic_writing')).toBe('1');
		expect(valueAfter(args, '-start_number')).toBe('0');
		expect(args.at(-1)).toBe('/cache/abc/sheet-%03d.jpg');
	});

	it('tone-maps HDR sources between scaling and tiling', () => {
		const args = trickplayArgs({ ...base, hdr: true });
		expect(valueAfter(args, '-vf')).toBe(
			`fps=1/10:start_time=0,tpad=stop=3:stop_mode=clone,scale=320:180,setsar=1,${HDR_TONEMAP_FILTERS},tile=10x10`
		);
	});
});

describe('sheetFileName', () => {
	it('matches the muxer pattern', () => {
		expect(sheetFileName(0)).toBe('sheet-000.jpg');
		expect(sheetFileName(12)).toBe('sheet-012.jpg');
		expect(sheetFileName(1000)).toBe('sheet-1000.jpg');
	});
});
