import { normalizeLanguage, type AudioSource } from '@finderella/protocol';

/** The subset of ffprobe's `-show_streams` JSON the audio mapper reads. */
export interface FfprobeAudioStream {
	index?: number;
	codec_type?: string;
	codec_name?: string;
	channels?: number;
	tags?: { language?: string; title?: string };
	disposition?: { default?: number; comment?: number; visual_impaired?: number };
}

/**
 * Every audio stream of a probed container, in container order. The absolute
 * stream index is kept so a transcode can `-map 0:<index>`.
 */
export function embeddedAudio(streams: FfprobeAudioStream[] | undefined): AudioSource[] {
	const out: AudioSource[] = [];
	for (const stream of streams ?? []) {
		if (stream.codec_type !== 'audio') continue;
		if (typeof stream.index !== 'number') continue;
		const title = stream.tags?.title?.trim();
		const channels = stream.channels;
		out.push({
			streamIndex: stream.index,
			codec: stream.codec_name ?? '',
			language: normalizeLanguage(stream.tags?.language),
			title: title || undefined,
			channels: typeof channels === 'number' && channels > 0 ? channels : undefined,
			isDefault: stream.disposition?.default === 1,
			commentary: stream.disposition?.comment === 1,
			descriptive: stream.disposition?.visual_impaired === 1
		});
	}
	return out;
}
