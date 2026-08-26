import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, library, mediaFile, movie, series } from '$lib/server/db/schema';
import { registry } from '$lib/server/agents/registry';
import { isDirectPlayable, type MediaFileRow } from './compat';

export interface PlayableSource {
	file: MediaFileRow;
	rootPath: string;
	agentId: string;
	directPlayable: boolean;
}

async function pickFrom(files: MediaFileRow[]): Promise<PlayableSource | null> {
	const online = files.filter((f) => registry.isOnline(f.agentId));
	if (online.length === 0) return null;
	const ranked = online.toSorted((a, b) => {
		const direct = Number(isDirectPlayable(b)) - Number(isDirectPlayable(a));
		if (direct !== 0) return direct;
		const height = (b.height ?? 0) - (a.height ?? 0);
		if (height !== 0) return height;
		return (b.bitrate ?? 0) - (a.bitrate ?? 0);
	});
	const file = ranked[0];
	const lib = await db.query.library.findFirst({ where: eq(library.id, file.libraryId) });
	if (!lib) return null;
	return {
		file,
		rootPath: lib.rootPath,
		agentId: file.agentId,
		directPlayable: isDirectPlayable(file)
	};
}

/** Best online source for a movie slug, or null (offline agents / no files). */
export async function pickMovieSource(slug: string): Promise<PlayableSource | null> {
	const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	if (!row) return null;
	const files = await db.query.mediaFile.findMany({
		where: and(eq(mediaFile.movieId, row.id), eq(mediaFile.status, 'active'))
	});
	return pickFrom(files);
}

/** Best online source for an episode (by series slug + episode slug). */
export async function pickEpisodeSource(
	seriesSlug: string,
	episodeSlug: string
): Promise<PlayableSource | null> {
	const seriesRow = await db.query.series.findFirst({ where: eq(series.slug, seriesSlug) });
	if (!seriesRow) return null;
	const episodeRow = await db.query.episode.findFirst({
		where: and(eq(episode.seriesId, seriesRow.id), eq(episode.slug, episodeSlug))
	});
	if (!episodeRow) return null;
	const files = await db.query.mediaFile.findMany({
		where: and(eq(mediaFile.episodeId, episodeRow.id), eq(mediaFile.status, 'active'))
	});
	return pickFrom(files);
}
