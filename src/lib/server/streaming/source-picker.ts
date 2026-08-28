import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, library, mediaFile, movie, series } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { isDirectPlayable, type MediaFileRow } from './compat';

export interface PlayableSource {
	file: MediaFileRow;
	rootPath: string;
	gatewayId: string;
	directPlayable: boolean;
}

/** Why no source could be picked: the title has no file at all, or none of its devices is connected. */
export type SourceLookup =
	{ source: PlayableSource; reason?: undefined } | { source: null; reason: 'no-files' | 'offline' };

const NO_FILES: SourceLookup = { source: null, reason: 'no-files' };

async function pickFrom(files: MediaFileRow[]): Promise<SourceLookup> {
	if (files.length === 0) return NO_FILES;
	const online = files.filter((f) => registry.isOnline(f.gatewayId));
	if (online.length === 0) return { source: null, reason: 'offline' };
	const ranked = online.toSorted((a, b) => {
		const direct = Number(isDirectPlayable(b)) - Number(isDirectPlayable(a));
		if (direct !== 0) return direct;
		const height = (b.height ?? 0) - (a.height ?? 0);
		if (height !== 0) return height;
		return (b.bitrate ?? 0) - (a.bitrate ?? 0);
	});
	const file = ranked[0];
	const lib = await db.query.library.findFirst({ where: eq(library.id, file.libraryId) });
	if (!lib) return NO_FILES;
	return {
		source: {
			file,
			rootPath: lib.rootPath,
			gatewayId: file.gatewayId,
			directPlayable: isDirectPlayable(file)
		}
	};
}

/** Best online source for a movie slug. */
export async function pickMovieSource(slug: string): Promise<SourceLookup> {
	const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
	if (!row) return NO_FILES;
	const files = await db.query.mediaFile.findMany({
		where: and(eq(mediaFile.movieId, row.id), eq(mediaFile.status, 'active'))
	});
	return pickFrom(files);
}

/** Best online source for an episode (by series slug + episode slug). */
export async function pickEpisodeSource(
	seriesSlug: string,
	episodeSlug: string
): Promise<SourceLookup> {
	const seriesRow = await db.query.series.findFirst({ where: eq(series.slug, seriesSlug) });
	if (!seriesRow) return NO_FILES;
	const episodeRow = await db.query.episode.findFirst({
		where: and(eq(episode.seriesId, seriesRow.id), eq(episode.slug, episodeSlug))
	});
	if (!episodeRow) return NO_FILES;
	const files = await db.query.mediaFile.findMany({
		where: and(eq(mediaFile.episodeId, episodeRow.id), eq(mediaFile.status, 'active'))
	});
	return pickFrom(files);
}
