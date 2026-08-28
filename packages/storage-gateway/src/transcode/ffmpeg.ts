import { join } from 'node:path';

/** Mirrors TranscodePlan in the hub's src/lib/playback-quality.ts. */
export interface TranscodeQuality {
	maxWidth: number;
	/** VBV cap for the video stream (kbit/s); absent = CRF only. */
	maxVideoKbps?: number;
	audioKbps: number;
	/** H.264 level: 4.1 up to 1080p, 5.2 for anything wider. */
	level: '4.1' | '5.2';
}

export interface HlsJobOptions {
	absPath: string;
	dir: string;
	startSegment: number;
	segmentSeconds: number;
	quality: TranscodeQuality;
	/** Source is HDR (PQ/HLG): tone-map to BT.709 so the SDR output isn't grey. */
	hdr?: boolean;
}

/** Widest output the transcoder emits regardless of plan; larger sources are downscaled. */
export const HLS_MAX_WIDTH = 3840;

/**
 * zscale (libzimg) + tonemap chain: linearize with the PQ/HLG transfer the
 * frames carry, tone-map (Hable) into BT.709 primaries, then back to a
 * limited-range BT.709 8-bit picture. Runs after the scaler so it works on
 * the output size, not the 4K source.
 */
export const HDR_TONEMAP_FILTERS =
	'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

/**
 * ffmpeg argv for one HLS transcode run. Everything is re-encoded to
 * h264/aac fmp4 segments force-aligned to the segment grid, so segment n
 * always covers [n*len, (n+1)*len) and the hub can synthesize a full VOD
 * playlist from the known duration. `-ss` before `-i` gives fast seeks.
 *
 * The video output is pinned to a browser-safe profile: 8-bit yuv420p,
 * H.264 High at the plan's level (4.1 ≤1080p, 5.2 above), at most
 * `quality.maxWidth` wide (even dimensions, which yuv420p requires). Without
 * `-pix_fmt`, libx264 keeps a 10-bit source's depth and emits High 10 — which
 * MSE in every browser refuses, with ffmpeg exiting 0 and every segment
 * looking healthy. The hub's master-playlist CODECS string comes from the same
 * plan (`transcodePlan` in src/lib/playback-quality.ts), so profile/level
 * here and there must agree.
 *
 * Timestamps are 0-based per run (ffmpeg's mov muxer rebases regardless of
 * -copyts/-output_ts_offset); after a mid-file restart the gateway patches
 * each segment's tfdt boxes to the absolute timeline (see mp4-patch.ts) so
 * hls.js places fragments correctly.
 * (A copy/remux fast path is deliberately deferred: stream-copied segments
 * split on existing keyframes and would break the fixed grid.)
 */
export function hlsArgs(opts: HlsJobOptions): string[] {
	const len = opts.segmentSeconds;
	const startTime = opts.startSegment * len;
	const { quality } = opts;
	const maxWidth = Math.min(HLS_MAX_WIDTH, quality.maxWidth);
	// `\,` keeps the comma inside min() from splitting the filtergraph.
	const filters = [`scale=trunc(min(${maxWidth}\\,iw)/2)*2:-2`];
	if (opts.hdr) filters.push(HDR_TONEMAP_FILTERS);

	const args = ['-hide_banner', '-loglevel', 'error', '-y'];
	if (startTime > 0) args.push('-ss', String(startTime));
	args.push(
		'-i',
		opts.absPath,
		'-map',
		'0:v:0',
		'-map',
		'0:a:0?',
		'-vf',
		filters.join(','),
		'-c:v',
		'libx264',
		'-preset',
		'veryfast',
		'-crf',
		'23'
	);
	if (quality.maxVideoKbps) {
		// CRF still decides quality, but VBV keeps peaks under the rung's cap so a
		// remote uplink at that rate never falls behind.
		args.push('-maxrate', `${quality.maxVideoKbps}k`, '-bufsize', `${quality.maxVideoKbps * 2}k`);
	}
	args.push(
		'-profile:v',
		'high',
		'-level',
		quality.level,
		'-pix_fmt',
		'yuv420p',
		'-force_key_frames',
		`expr:gte(t,n_forced*${len})`,
		'-c:a',
		'aac',
		'-b:a',
		`${quality.audioKbps}k`,
		'-ac',
		'2',
		'-f',
		'hls',
		'-hls_time',
		String(len),
		'-hls_segment_type',
		'fmp4',
		// ffmpeg's own playlist is only the gateway's readiness signal (the hub
		// synthesizes the real VOD playlist). `event` appends an entry as each
		// segment closes; `vod` writes the playlist only when ffmpeg exits, which
		// makes every segment wait time out on any file longer than the timeout.
		'-hls_playlist_type',
		'event',
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
