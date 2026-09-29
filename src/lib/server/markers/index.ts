import { eq } from 'drizzle-orm';
import type { PlaybackMarkers } from '$lib/data/markers';
import { db } from '$lib/server/db';
import { mediaMarker } from '$lib/server/db/schema';
import { markersEnabled } from '$lib/server/site-settings';
import { resolveMarkers } from './resolve';

/** Intro/credits of the file a session plays, for the player; null when there are none (or the feature is off). */
export async function playbackMarkers(file: {
	id: string;
	durationMs: number | null;
}): Promise<PlaybackMarkers | null> {
	if (!(await markersEnabled())) return null;
	const rows = await db
		.select({
			kind: mediaMarker.kind,
			source: mediaMarker.source,
			startMs: mediaMarker.startMs,
			endMs: mediaMarker.endMs,
			confidence: mediaMarker.confidence
		})
		.from(mediaMarker)
		.where(eq(mediaMarker.mediaFileId, file.id));
	return resolveMarkers(rows, file.durationMs);
}
