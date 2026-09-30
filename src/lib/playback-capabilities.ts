/**
 * What this browser can remux (see $lib/data/remux): the codecs its Media
 * Source Extensions take in fragmented MP4, and the WebCodecs encoders it has
 * for converting audio it can't play. Asked once per tab and sent with every
 * playback start, so the hub only offers a remux the browser can handle.
 * The remux player re-checks the file's exact codec strings when it opens it
 * (10-bit HEVC, profiles) and falls back to a transcode when that fails.
 */

import type {
	PlaybackCapabilities,
	RemuxAudioCodec,
	RemuxAudioEncoder,
	RemuxVideoCodec
} from './data/remux';

/** MSE type strings per codec; any one supported counts (spellings differ per browser). */
const VIDEO_TYPES: Record<RemuxVideoCodec, string[]> = {
	h264: ['video/mp4; codecs="avc1.640028"'],
	// Main, then Main 10: either means the browser has an HEVC decoder.
	hevc: ['video/mp4; codecs="hvc1.1.6.L120.90"', 'video/mp4; codecs="hvc1.2.4.L150.90"'],
	vp9: ['video/mp4; codecs="vp09.00.40.08"'],
	av1: ['video/mp4; codecs="av01.0.08M.08"']
};

const AUDIO_TYPES: Record<RemuxAudioCodec, string[]> = {
	aac: ['audio/mp4; codecs="mp4a.40.2"'],
	mp3: ['audio/mp4; codecs="mp3"', 'audio/mp4; codecs="mp4a.6B"', 'audio/mp4; codecs="mp4a.69"'],
	opus: ['audio/mp4; codecs="opus"'],
	flac: ['audio/mp4; codecs="flac"', 'audio/mp4; codecs="fLaC"'],
	ac3: ['audio/mp4; codecs="ac-3"'],
	eac3: ['audio/mp4; codecs="ec-3"']
};

/** WebCodecs configs for the stereo conversion of AC-3 / E-AC-3. */
const ENCODER_CONFIGS: Record<RemuxAudioEncoder, AudioEncoderConfig> = {
	opus: { codec: 'opus', sampleRate: 48_000, numberOfChannels: 2, bitrate: 160_000 },
	aac: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, bitrate: 160_000 }
};

/**
 * The 5.1 conversion: Opus only (a Firefox round trip verified every channel
 * lands where it belongs; 5.1 AAC encoders are the OS's and unverified).
 */
const SURROUND_ENCODER: AudioEncoderConfig = {
	codec: 'opus',
	sampleRate: 48_000,
	numberOfChannels: 6,
	bitrate: 384_000
};

/** Does MSE play 6-channel Opus? Only an explicit yes counts: a stereo remux is the safe answer. */
async function canPlaySurroundOpus(): Promise<boolean> {
	try {
		const info = await navigator.mediaCapabilities.decodingInfo({
			type: 'media-source',
			audio: { contentType: 'audio/mp4; codecs="opus"', channels: '6' }
		});
		return info.supported === true;
	} catch {
		return false;
	}
}

type MediaSourceLike = { isTypeSupported(type: string): boolean };

/** MSE, or Safari's ManagedMediaSource (the only one iOS has). */
export function mediaSourceApi(): MediaSourceLike | null {
	const g = globalThis as { MediaSource?: MediaSourceLike; ManagedMediaSource?: MediaSourceLike };
	return g.MediaSource ?? g.ManagedMediaSource ?? null;
}

async function canEncode(config: AudioEncoderConfig): Promise<boolean> {
	try {
		if (typeof AudioEncoder === 'undefined') return false;
		return (await AudioEncoder.isConfigSupported(config)).supported === true;
	} catch {
		return false;
	}
}

async function probe(): Promise<PlaybackCapabilities | null> {
	const ms = mediaSourceApi();
	if (!ms) return null;
	const supported = (types: string[]) =>
		types.some((type) => {
			try {
				return ms.isTypeSupported(type);
			} catch {
				return false;
			}
		});
	const pick = <K extends string>(table: Record<K, string[]>) =>
		(Object.keys(table) as K[]).filter((codec) => supported(table[codec]));
	const encoders = Object.keys(ENCODER_CONFIGS) as RemuxAudioEncoder[];
	const [encodable, surroundEncode, surroundPlay] = await Promise.all([
		Promise.all(encoders.map((codec) => canEncode(ENCODER_CONFIGS[codec]))),
		canEncode(SURROUND_ENCODER),
		canPlaySurroundOpus()
	]);
	return {
		video: pick(VIDEO_TYPES),
		audio: pick(AUDIO_TYPES),
		encode: encoders.filter((_, i) => encodable[i]),
		surround: surroundEncode && surroundPlay ? ['opus'] : []
	};
}

let cached: Promise<PlaybackCapabilities | null> | undefined;

/** This browser's remux capabilities (null = no Media Source Extensions). Cached for the tab. */
export function playbackCapabilities(): Promise<PlaybackCapabilities | null> {
	cached ??= probe();
	return cached;
}
