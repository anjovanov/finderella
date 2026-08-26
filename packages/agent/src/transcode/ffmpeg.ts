import { join } from 'node:path';

export interface HlsJobOptions {
	absPath: string;
	dir: string;
	startSegment: number;
	segmentSeconds: number;
}

/**
 * ffmpeg argv for one HLS transcode run. Everything is re-encoded to
 * h264/aac fmp4 segments force-aligned to the segment grid, so segment n
 * always covers [n*len, (n+1)*len) and the hub can synthesize a full VOD
 * playlist from the known duration. `-ss` before `-i` gives fast seeks.
 *
 * Timestamps are 0-based per run (ffmpeg's mov muxer rebases regardless of
 * -copyts/-output_ts_offset); after a mid-file restart the agent patches
 * each segment's tfdt boxes to the absolute timeline (see mp4-patch.ts) so
 * hls.js places fragments correctly.
 * (A copy/remux fast path is deliberately deferred: stream-copied segments
 * split on existing keyframes and would break the fixed grid.)
 */
export function hlsArgs(opts: HlsJobOptions): string[] {
	const len = opts.segmentSeconds;
	const startTime = opts.startSegment * len;
	const args = ['-hide_banner', '-loglevel', 'error', '-y'];
	if (startTime > 0) args.push('-ss', String(startTime));
	args.push(
		'-i',
		opts.absPath,
		'-map',
		'0:v:0',
		'-map',
		'0:a:0?',
		'-c:v',
		'libx264',
		'-preset',
		'veryfast',
		'-crf',
		'23',
		'-force_key_frames',
		`expr:gte(t,n_forced*${len})`,
		'-c:a',
		'aac',
		'-b:a',
		'192k',
		'-ac',
		'2',
		'-f',
		'hls',
		'-hls_time',
		String(len),
		'-hls_segment_type',
		'fmp4',
		'-hls_playlist_type',
		'vod',
		'-hls_fmp4_init_filename',
		'init.mp4',
		'-start_number',
		String(opts.startSegment),
		'-hls_segment_filename',
		join(opts.dir, 'seg-%d.m4s'),
		join(opts.dir, 'playlist.m3u8')
	);
	return args;
}
