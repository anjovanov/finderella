import type { ProbedChapter } from '@finderella/protocol';

/** ffprobe `-show_chapters` entry (times are decimal-second strings). */
export interface FfprobeChapter {
	start_time?: string;
	end_time?: string;
	tags?: { title?: string; [key: string]: string | undefined };
}

const MAX_CHAPTERS = 200;

/** Normalise ffprobe chapters: numeric ms, sorted, trimmed titles, broken entries dropped. */
export function probedChapters(chapters: FfprobeChapter[] | undefined): ProbedChapter[] {
	if (!chapters) return [];
	const out: ProbedChapter[] = [];
	for (const chapter of chapters) {
		const start = Number(chapter.start_time);
		const end = Number(chapter.end_time);
		if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;
		const title = (chapter.tags?.title ?? chapter.tags?.TITLE)?.trim().slice(0, 200);
		out.push({
			startMs: Math.round(start * 1000),
			endMs: Math.round(end * 1000),
			...(title ? { title } : {})
		});
	}
	out.sort((a, b) => a.startMs - b.startMs);
	return out.slice(0, MAX_CHAPTERS);
}
