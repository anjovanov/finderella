import type { mediaFile } from '$lib/server/db/schema';

export type MediaFileRow = typeof mediaFile.$inferSelect;

const MP4_CONTAINERS = new Set(['mp4', 'm4v', 'mov']);
const MP4_VIDEO = new Set(['h264', 'avc1']);
const MP4_AUDIO = new Set(['aac', 'mp3']);
const WEBM_VIDEO = new Set(['vp8', 'vp9', 'av1']);
const WEBM_AUDIO = new Set(['opus', 'vorbis']);

export const CONTENT_TYPES: Record<string, string> = {
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm',
	mkv: 'video/x-matroska',
	avi: 'video/x-msvideo',
	ts: 'video/mp2t',
	wmv: 'video/x-ms-wmv'
};

/**
 * Can the browser play this file as-is (progressive <video src>)?
 * Unknown codecs (agent had no ffprobe) are given the benefit of the doubt
 * for browser-native containers — playback simply fails client-side if not.
 */
export function isDirectPlayable(file: MediaFileRow): boolean {
	const container = file.container.toLowerCase();
	if (MP4_CONTAINERS.has(container)) {
		if (!file.videoCodec) return true; // unprobed: assume yes for mp4
		return MP4_VIDEO.has(file.videoCodec) && (!file.audioCodec || MP4_AUDIO.has(file.audioCodec));
	}
	if (container === 'webm') {
		if (!file.videoCodec) return true;
		return WEBM_VIDEO.has(file.videoCodec) && (!file.audioCodec || WEBM_AUDIO.has(file.audioCodec));
	}
	return false;
}

export function contentTypeFor(file: MediaFileRow): string {
	return CONTENT_TYPES[file.container.toLowerCase()] ?? 'application/octet-stream';
}
