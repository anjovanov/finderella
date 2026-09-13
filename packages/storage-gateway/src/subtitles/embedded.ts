import { TEXT_SUBTITLE_CODECS, normalizeLanguage, type SubtitleSource } from '@finderella/protocol';

/** The subset of ffprobe's `-show_streams` JSON the subtitle mapper reads. */
export interface FfprobeSubtitleStream {
	index?: number;
	codec_type?: string;
	codec_name?: string;
	tags?: { language?: string; title?: string };
	disposition?: { default?: number; forced?: number; hearing_impaired?: number };
}

const TEXT_CODECS = new Set<string>(TEXT_SUBTITLE_CODECS);

/**
 * Embedded text subtitle tracks of a probed container. Bitmap tracks (PGS,
 * VobSub, DVB) are dropped — they can't become WebVTT without OCR. The
 * absolute stream index is kept so extraction can `-map 0:<index>`.
 */
export function embeddedSubtitles(streams: FfprobeSubtitleStream[] | undefined): SubtitleSource[] {
	const out: SubtitleSource[] = [];
	for (const stream of streams ?? []) {
		if (stream.codec_type !== 'subtitle') continue;
		if (typeof stream.index !== 'number') continue;
		const codec = stream.codec_name ?? '';
		if (!TEXT_CODECS.has(codec)) continue;
		const title = stream.tags?.title?.trim();
		out.push({
			source: 'embedded',
			streamIndex: stream.index,
			codec,
			language: normalizeLanguage(stream.tags?.language),
			title: title || undefined,
			isDefault: stream.disposition?.default === 1,
			forced: stream.disposition?.forced === 1,
			hearingImpaired: stream.disposition?.hearing_impaired === 1
		});
	}
	return out;
}
