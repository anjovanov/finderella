import { z } from 'zod';

/** File extensions the scanner treats as video media. */
export const VIDEO_EXTENSIONS = [
	'.mp4',
	'.m4v',
	'.mkv',
	'.webm',
	'.mov',
	'.avi',
	'.ts',
	'.wmv'
] as const;

/** Sidecar subtitle files the scanner pairs with a video (same folder or `Subs/`). */
export const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa'] as const;
export const SubtitleFormat = z.enum(['srt', 'vtt', 'ass', 'ssa']);
export type SubtitleFormat = z.infer<typeof SubtitleFormat>;

/**
 * Embedded subtitle codecs that convert to WebVTT. Bitmap formats (PGS,
 * VobSub, DVB, teletext) would need OCR and are skipped at scan time.
 */
export const TEXT_SUBTITLE_CODECS = ['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'] as const;

/**
 * One subtitle track available for a media file. `language` is a lowercase
 * ISO 639-1 code when it could be determined (see languages.ts).
 */
export const SubtitleSource = z.discriminatedUnion('source', [
	z.object({
		source: z.literal('embedded'),
		/** ffprobe's absolute stream index (ffmpeg `-map 0:<index>`), not the ordinal among subtitle streams. */
		streamIndex: z.number().int().nonnegative(),
		codec: z.string(),
		language: z.string().optional(),
		title: z.string().optional(),
		isDefault: z.boolean(),
		forced: z.boolean(),
		hearingImpaired: z.boolean()
	}),
	z.object({
		source: z.literal('sidecar'),
		/** Library-relative path of the subtitle file (like ProbedFile.relPath). */
		relPath: z.string().min(1),
		format: SubtitleFormat,
		language: z.string().optional(),
		title: z.string().optional(),
		forced: z.boolean(),
		hearingImpaired: z.boolean()
	})
]);
export type SubtitleSource = z.infer<typeof SubtitleSource>;

/**
 * One scanned media file as reported by an gateway. Codec/duration fields are
 * absent when the gateway has no ffprobe (capability reported in `hello`).
 */
export const ProbedFile = z.object({
	relPath: z.string().min(1),
	size: z.number().int().nonnegative(),
	mtimeMs: z.number().nonnegative(),
	container: z.string(),
	videoCodec: z.string().optional(),
	audioCodec: z.string().optional(),
	width: z.number().int().positive().optional(),
	height: z.number().int().positive().optional(),
	durationMs: z.number().int().nonnegative().optional(),
	bitrate: z.number().int().nonnegative().optional(),
	/** Absent from gateways that predate subtitle discovery (the hub then keeps its rows). */
	subtitles: z.array(SubtitleSource).optional()
});
export type ProbedFile = z.infer<typeof ProbedFile>;

export const LibraryKind = z.enum(['movie', 'series']);
export type LibraryKind = z.infer<typeof LibraryKind>;
