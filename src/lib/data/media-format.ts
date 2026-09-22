/**
 * Human-readable labels for the file-format tooltip (detail pages). Codec
 * names are ffprobe's `codec_name` values as stored at scan time.
 */

import { languageName } from '@finderella/protocol/languages';
import type { AudioFormat } from './types';

const VIDEO_CODECS: Record<string, string> = {
	h264: 'H.264 (AVC)',
	hevc: 'H.265 (HEVC)',
	av1: 'AV1',
	vp9: 'VP9',
	vp8: 'VP8',
	mpeg4: 'MPEG-4 Part 2',
	mpeg2video: 'MPEG-2',
	mpeg1video: 'MPEG-1',
	vc1: 'VC-1',
	wmv3: 'Windows Media Video 9',
	msmpeg4v3: 'MPEG-4 (DivX 3)',
	theora: 'Theora'
};

const AUDIO_CODECS: Record<string, string> = {
	aac: 'AAC',
	ac3: 'Dolby Digital (AC-3)',
	eac3: 'Dolby Digital Plus (E-AC-3)',
	truehd: 'Dolby TrueHD',
	dts: 'DTS',
	mp3: 'MP3',
	mp2: 'MP2',
	opus: 'Opus',
	vorbis: 'Vorbis',
	flac: 'FLAC',
	alac: 'ALAC',
	wmav2: 'Windows Media Audio'
};

export function videoCodecLabel(codec: string | null): string {
	if (!codec) return 'Unknown';
	return VIDEO_CODECS[codec] ?? codec.toUpperCase();
}

export function audioCodecLabel(codec: string): string {
	if (codec.startsWith('pcm_')) return 'PCM';
	return AUDIO_CODECS[codec] ?? codec.toUpperCase();
}

/** Channel count as a layout name: Mono, Stereo, 5.1, 7.1, else "N ch". */
export function channelLabel(channels: number | null): string | null {
	switch (channels) {
		case null:
			return null;
		case 1:
			return 'Mono';
		case 2:
			return 'Stereo';
		case 6:
			return '5.1';
		case 8:
			return '7.1';
		default:
			return `${channels} ch`;
	}
}

/** Binary units, one decimal from GB up: "14.2 GB", "700 MB". */
export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${unit >= 3 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Bits per second as "18.3 Mb/s" / "850 kb/s". */
export function formatBitrate(bitsPerSecond: number): string {
	if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mb/s`;
	return `${Math.round(bitsPerSecond / 1000)} kb/s`;
}

/** "English", else the stream title, else "Track N". */
export function audioName(track: AudioFormat, index: number): string {
	return languageName(track.language) ?? (track.title?.trim() || `Track ${index + 1}`);
}

/** Codec + layout + markers: "Dolby Digital Plus (E-AC-3) 5.1 · Commentary". */
export function audioDetails(track: AudioFormat): string {
	const parts = [audioCodecLabel(track.codec), channelLabel(track.channels)]
		.filter(Boolean)
		.join(' ');
	const markers = [track.commentary && 'Commentary', track.descriptive && 'Audio description'];
	return [parts, ...markers].filter(Boolean).join(' · ');
}
