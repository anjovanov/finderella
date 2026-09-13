import { eq } from 'drizzle-orm';
import { languageName } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { mediaSubtitle } from '$lib/server/db/schema';
import type { SubtitleTrack } from '$lib/data/types';

type SubtitleRow = typeof mediaSubtitle.$inferSelect;

function baseLabel(row: SubtitleRow, index: number): string {
	const name = languageName(row.language);
	const title = row.title?.trim();
	if (!name) return title || `Track ${index + 1}`;
	// A title that just repeats the language ("English (SDH)") adds nothing.
	if (title && !title.toLowerCase().includes(name.toLowerCase())) return `${name} (${title})`;
	return name;
}

/** Player-facing label: language, an informative title, and forced/SDH markers. */
export function subtitleLabel(row: SubtitleRow, index: number): string {
	let label = baseLabel(row, index);
	if (row.forced) label += ' (forced)';
	if (row.hearingImpaired) label += ' (SDH)';
	return label;
}

function compareRows(a: SubtitleRow, b: SubtitleRow): number {
	if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
	const nameA = languageName(a.language) ?? '￿';
	const nameB = languageName(b.language) ?? '￿';
	if (nameA !== nameB) return nameA.localeCompare(nameB);
	if (a.forced !== b.forced) return a.forced ? 1 : -1;
	if (a.hearingImpaired !== b.hearingImpaired) return a.hearingImpaired ? 1 : -1;
	return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * The subtitle tracks of a media file as the player consumes them, with
 * stream URLs bound to a playback session (the session uuid is the
 * capability that authorizes the fetch). Sorted default → language →
 * plain before forced/SDH; duplicate labels get a numeric suffix.
 */
export async function listSubtitleTracks(
	mediaFileId: string,
	sessionId: string
): Promise<SubtitleTrack[]> {
	const rows = await db.query.mediaSubtitle.findMany({
		where: eq(mediaSubtitle.mediaFileId, mediaFileId)
	});
	rows.sort(compareRows);
	const seen = new Map<string, number>();
	return rows.map((row, index) => {
		let label = subtitleLabel(row, index);
		const count = (seen.get(label) ?? 0) + 1;
		seen.set(label, count);
		if (count > 1) label = `${label} ${count}`;
		return {
			id: row.id,
			src: `/api/stream/${sessionId}/subtitle/${row.id}.vtt`,
			srclang: row.language ?? 'und',
			label,
			kind: row.hearingImpaired ? 'captions' : 'subtitles',
			default: row.isDefault,
			forced: row.forced
		};
	});
}
