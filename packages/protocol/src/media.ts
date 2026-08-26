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

/**
 * One scanned media file as reported by an agent. Codec/duration fields are
 * absent when the agent has no ffprobe (capability reported in `hello`).
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
	bitrate: z.number().int().nonnegative().optional()
});
export type ProbedFile = z.infer<typeof ProbedFile>;

export const LibraryKind = z.enum(['movie', 'series']);
export type LibraryKind = z.infer<typeof LibraryKind>;
