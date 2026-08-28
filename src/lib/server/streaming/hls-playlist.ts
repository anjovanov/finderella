export const SEGMENT_SECONDS = 4;

/**
 * Hub-synthesized VOD playlists (the Jellyfin trick): duration is known from
 * ffprobe, and the gateway's ffmpeg is forced onto a fixed segment grid, so we
 * can hand the browser a complete seekable playlist before a single segment
 * exists. Segment n deterministically covers [n*len, (n+1)*len).
 */

/**
 * CODECS must describe what the gateway's ffmpeg actually emits (see hlsArgs
 * in packages/storage-gateway/src/transcode/ffmpeg.ts): the video codec string
 * comes from the session's TranscodePlan (High@4.1 or High@5.2, 8-bit); audio
 * is always AAC-LC. hls.js checks these against MediaSource.isTypeSupported
 * before opening buffers, so they must track the encoder flags, not the source.
 */
export const HLS_AUDIO_CODEC = 'mp4a.40.2';

export function buildMasterPlaylist(
	bitrate: number | null,
	hasAudio: boolean,
	videoCodec: string
): string {
	const bandwidth = bitrate && bitrate > 0 ? bitrate : 5_000_000;
	// Declaring an audio codec for a silent source makes hls.js wait for an
	// audio track that never arrives.
	const codecs = hasAudio ? `${videoCodec},${HLS_AUDIO_CODEC}` : videoCodec;
	return [
		'#EXTM3U',
		'#EXT-X-VERSION:7',
		`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},CODECS="${codecs}"`,
		'media.m3u8',
		''
	].join('\n');
}

export function buildMediaPlaylist(durationMs: number): string {
	const total = durationMs / 1000;
	const count = Math.ceil(total / SEGMENT_SECONDS);
	const lines = [
		'#EXTM3U',
		'#EXT-X-VERSION:7',
		`#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`,
		'#EXT-X-PLAYLIST-TYPE:VOD',
		'#EXT-X-MEDIA-SEQUENCE:0',
		'#EXT-X-MAP:URI="init.mp4"'
	];
	for (let n = 0; n < count; n++) {
		const length = n === count - 1 ? total - SEGMENT_SECONDS * n : SEGMENT_SECONDS;
		lines.push(`#EXTINF:${length.toFixed(6)},`, `seg-${n}.m4s`);
	}
	lines.push('#EXT-X-ENDLIST', '');
	return lines.join('\n');
}
