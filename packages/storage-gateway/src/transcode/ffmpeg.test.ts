import { describe, expect, it } from 'vitest';
import { HDR_TONEMAP_FILTERS, hlsArgs, type TranscodeQuality } from './ffmpeg.js';

const auto: TranscodeQuality = { maxWidth: 3840, audioKbps: 192, level: '4.1' };
const base = { absPath: '/media/show.mkv', dir: '/tmp/sess', segmentSeconds: 4, quality: auto };

function valueAfter(args: string[], flag: string): string | undefined {
	const i = args.indexOf(flag);
	return i === -1 ? undefined : args[i + 1];
}

describe('hlsArgs', () => {
	it('pins a browser-decodable 8-bit H.264 High output at the planned level', () => {
		const args = hlsArgs({ ...base, startSegment: 0 });
		expect(valueAfter(args, '-c:v')).toBe('libx264');
		expect(valueAfter(args, '-pix_fmt')).toBe('yuv420p');
		expect(valueAfter(args, '-profile:v')).toBe('high');
		expect(valueAfter(args, '-level')).toBe('4.1');
		expect(valueAfter(args, '-vf')).toBe('scale=trunc(min(3840\\,iw)/2)*2:-2');
		expect(args).not.toContain('copy');
		expect(args).not.toContain('-maxrate');
		expect(valueAfter(args, '-b:a')).toBe('192k');

		const uhd = hlsArgs({ ...base, startSegment: 0, quality: { ...auto, level: '5.2' } });
		expect(valueAfter(uhd, '-level')).toBe('5.2');
	});

	it('tone-maps HDR sources after scaling', () => {
		const args = hlsArgs({ ...base, startSegment: 0, hdr: true });
		expect(valueAfter(args, '-vf')).toBe(
			`scale=trunc(min(3840\\,iw)/2)*2:-2,${HDR_TONEMAP_FILTERS}`
		);
		expect(HDR_TONEMAP_FILTERS).toMatch(/^zscale=t=linear.*tonemap=hable.*format=yuv420p$/);
		expect(valueAfter(hlsArgs({ ...base, startSegment: 0 }), '-vf')).not.toContain('tonemap');
	});

	it('keeps the fixed segment grid the hub synthesizes playlists from', () => {
		const args = hlsArgs({ ...base, startSegment: 0 });
		expect(valueAfter(args, '-force_key_frames')).toBe('expr:gte(t,n_forced*4)');
		expect(valueAfter(args, '-hls_time')).toBe('4');
		// `vod` defers the playlist until exit; readiness detection needs `event`.
		expect(valueAfter(args, '-hls_playlist_type')).toBe('event');
		expect(valueAfter(args, '-hls_segment_type')).toBe('fmp4');
		expect(valueAfter(args, '-hls_segment_filename')).toBe('/tmp/sess/seg-%d.m4s');
		expect(args.at(-1)).toBe('/tmp/sess/playlist.m3u8');
		expect(args).not.toContain('-ss');
		expect(valueAfter(args, '-start_number')).toBe('0');
	});

	it('seeks with -ss before -i on a restart', () => {
		const args = hlsArgs({ ...base, startSegment: 2 });
		expect(valueAfter(args, '-ss')).toBe('8');
		expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
		expect(valueAfter(args, '-start_number')).toBe('2');
	});

	it('caps width, video bitrate and audio bitrate for an explicit quality rung', () => {
		const args = hlsArgs({
			...base,
			startSegment: 0,
			quality: { maxWidth: 1280, maxVideoKbps: 4000, audioKbps: 160, level: '4.1' }
		});
		expect(valueAfter(args, '-vf')).toBe('scale=trunc(min(1280\\,iw)/2)*2:-2');
		expect(valueAfter(args, '-maxrate')).toBe('4000k');
		expect(valueAfter(args, '-bufsize')).toBe('8000k');
		expect(valueAfter(args, '-b:a')).toBe('160k');
	});

	it('maps only the first video and (optional) first audio stream', () => {
		const args = hlsArgs({ ...base, startSegment: 0 });
		const maps = args.flatMap((a, i) => (a === '-map' ? [args[i + 1]] : []));
		expect(maps).toEqual(['0:v:0', '0:a:0?']);
		expect(valueAfter(args, '-ac')).toBe('2');
	});
});
