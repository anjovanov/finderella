export const SEGMENT_SECONDS = 4;

/**
 * Hub-synthesized VOD playlists (the Jellyfin trick): duration is known from
 * ffprobe, and the agent's ffmpeg is forced onto a fixed segment grid, so we
 * can hand the browser a complete seekable playlist before a single segment
 * exists. Segment n deterministically covers [n*len, (n+1)*len).
 */

export function buildMasterPlaylist(bitrate: number | null): string {
	const bandwidth = bitrate && bitrate > 0 ? bitrate : 5_000_000;
	return [
		'#EXTM3U',
		'#EXT-X-VERSION:7',
		`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},CODECS="avc1.640029,mp4a.40.2"`,
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
