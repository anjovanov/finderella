/**
 * Client-side remux (MKV/MP4 → fragmented MP4 in the browser, played through
 * Media Source Extensions): the capability vocabulary shared by the browser
 * probe (`$lib/playback-capabilities`) and the start route's decision
 * (`remuxPlan` in `$lib/server/streaming/compat`). Codec names are ffprobe's,
 * the same strings `media_file.video_codec` / `media_audio.codec` store.
 */

/** Video codecs a remux can carry into MSE. */
export const REMUX_VIDEO_CODECS = ['h264', 'hevc', 'vp9', 'av1'] as const;
export type RemuxVideoCodec = (typeof REMUX_VIDEO_CODECS)[number];

/** Audio codecs a remux can copy, when the browser's MSE takes them in MP4. */
export const REMUX_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'flac', 'ac3', 'eac3'] as const;
export type RemuxAudioCodec = (typeof REMUX_AUDIO_CODECS)[number];

/** Encoders the browser has for converting audio it can't play (AC-3/E-AC-3 → stereo). */
export const REMUX_AUDIO_ENCODERS = ['opus', 'aac'] as const;
export type RemuxAudioEncoder = (typeof REMUX_AUDIO_ENCODERS)[number];

/** Audio codecs the browser can decode itself (WASM) before re-encoding. */
export const CONVERTIBLE_AUDIO_CODECS: readonly string[] = ['ac3', 'eac3'];

/** What this browser can do, sent with every playback start. */
export interface PlaybackCapabilities {
	/** Video codecs MSE plays in fragmented MP4 (`hevc` = Main or Main 10; 10-bit is re-checked at play time). */
	video: RemuxVideoCodec[];
	/** Audio codecs MSE plays in fragmented MP4 (copied untouched). */
	audio: RemuxAudioCodec[];
	/** Stereo audio encoders (WebCodecs) for converting AC-3/E-AC-3. */
	encode: RemuxAudioEncoder[];
	/**
	 * Encoders that can also convert to 5.1 (and MSE plays the result). Only
	 * Opus is probed: its channel layout was verified end to end; a 5.1 AAC
	 * encode is left to the device's transcoder.
	 */
	surround: RemuxAudioEncoder[];
}

/** What the remux does with the audio: copy it, convert it (stereo or 5.1), or there is none. */
export type RemuxAudioAction = 'copy' | 'convert' | 'none';

/** A remux the browser can do: the audio action, and the channel count a conversion encodes. */
export interface RemuxDecision {
	audioAction: RemuxAudioAction;
	/** Convert only: 6 keeps 5.1 surround, 2 mixes down to stereo. Null when nothing is converted. */
	audioChannels: 2 | 6 | null;
}

/** ffprobe / container spellings of the same codec. */
const VIDEO_ALIASES: Record<string, RemuxVideoCodec> = {
	h264: 'h264',
	avc1: 'h264',
	hevc: 'hevc',
	h265: 'hevc',
	vp9: 'vp9',
	av1: 'av1'
};

/** Containers the in-browser demuxer reads. */
const REMUX_CONTAINERS = new Set(['mkv', 'webm', 'mp4', 'm4v', 'mov']);

/**
 * Can this browser play the file through a remux, and what happens to the
 * audio? Null = no (transcode instead). The browser re-checks the exact codec
 * strings when it opens the file (10-bit HEVC, profiles) and falls back to a
 * transcode itself when that check fails.
 *
 * `maxChannels` is the viewer's resolved audio-channels setting (6 = their
 * device plays 5.1). Copied audio passes through untouched, as in direct
 * play. A conversion keeps 5.1 when the viewer wants surround, the stream is
 * 5.1 and the browser can encode it; otherwise a surround viewer is better
 * served by the device's transcoder (which outputs 5.1) than by a stereo
 * remux, so this answers null.
 */
export function remuxPlan(
	file: { container: string; videoCodec: string | null },
	audio: { codec: string; channels: number | null } | null,
	caps: PlaybackCapabilities | null | undefined,
	maxChannels: 1 | 2 | 6 = 2
): RemuxDecision | null {
	if (!caps) return null;
	if (!REMUX_CONTAINERS.has(file.container.toLowerCase())) return null;
	const video = file.videoCodec ? VIDEO_ALIASES[file.videoCodec.toLowerCase()] : undefined;
	if (!video || !caps.video.includes(video)) return null;
	if (!audio) return { audioAction: 'none', audioChannels: null };
	const codec = audio.codec.toLowerCase();
	if ((caps.audio as string[]).includes(codec)) return { audioAction: 'copy', audioChannels: null };
	if (!CONVERTIBLE_AUDIO_CODECS.includes(codec)) return null;
	if (maxChannels === 6 && (audio.channels ?? 0) > 2) {
		// Exactly 5.1: a wider (7.1) stream is the transcoder's job, which folds it to 5.1.
		if (audio.channels === 6 && caps.surround.length > 0) {
			return { audioAction: 'convert', audioChannels: 6 };
		}
		return null;
	}
	return caps.encode.length > 0 ? { audioAction: 'convert', audioChannels: 2 } : null;
}
