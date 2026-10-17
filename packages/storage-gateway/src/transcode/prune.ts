/** Segments kept behind the newest one served (~2 min at 4 s): short seeks back stay instant. */
export const KEEP_BEHIND_SEGMENTS = 30;

const SEGMENT_FILE_RE = /^seg-(\d+)\.m4s$/;

/**
 * Segment numbers in a session folder listing that are far enough behind the
 * segment just served to delete. Without this a session keeps every segment
 * of the film until it stops. Only finished segment files match: init.mp4,
 * the playlist and `.patch` temp files are never touched.
 */
export function segmentsToPrune(
	names: string[],
	servedSegment: number,
	keepBehind = KEEP_BEHIND_SEGMENTS
): number[] {
	const out: number[] = [];
	for (const name of names) {
		const match = SEGMENT_FILE_RE.exec(name);
		if (!match) continue;
		const n = Number(match[1]);
		if (n < servedSegment - keepBehind) out.push(n);
	}
	return out.sort((a, b) => a - b);
}
