import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episode, gateway, movie, season, series, user } from '$lib/server/db/schema';
import { sessionManager, type HotSession } from '$lib/server/streaming/session-manager';
import { listSubtitleTracks } from '$lib/server/streaming/subtitles';
import type { ActiveStream, PlayTitle } from '$lib/data/stats';

/** What each live session is playing, for the admin activity monitor. */
export async function listActiveStreams(): Promise<ActiveStream[]> {
	const sessions = sessionManager.list().toSorted((a, b) => b.createdAt - a.createdAt);
	if (sessions.length === 0) return [];

	const ids = (pick: (s: HotSession) => string | null | undefined) => [
		...new Set(sessions.map(pick).filter((id): id is string => !!id))
	];
	const userIds = ids((s) => s.userId);
	const movieIds = ids((s) => s.source.file.movieId);
	const episodeIds = ids((s) => s.source.file.episodeId);
	const gatewayIds = ids((s) => s.source.gatewayId);

	const [users, movies, episodes, gateways, subtitleLabels] = await Promise.all([
		userIds.length
			? db
					.select({ id: user.id, name: user.name, image: user.image })
					.from(user)
					.where(inArray(user.id, userIds))
			: [],
		movieIds.length
			? db
					.select({
						id: movie.id,
						title: movie.title,
						year: movie.year,
						slug: movie.slug,
						posterUrl: movie.posterUrl,
						backdropUrl: movie.backdropUrl
					})
					.from(movie)
					.where(inArray(movie.id, movieIds))
			: [],
		episodeIds.length
			? db
					.select({
						id: episode.id,
						title: episode.title,
						number: episode.number,
						slug: episode.slug,
						stillUrl: episode.stillUrl,
						seasonNumber: season.number,
						seriesTitle: series.title,
						seriesYear: series.year,
						seriesSlug: series.slug,
						posterUrl: series.posterUrl,
						backdropUrl: series.backdropUrl
					})
					.from(episode)
					.innerJoin(season, eq(season.id, episode.seasonId))
					.innerJoin(series, eq(series.id, episode.seriesId))
					.where(inArray(episode.id, episodeIds))
			: [],
		db
			.select({ id: gateway.id, name: gateway.name })
			.from(gateway)
			.where(inArray(gateway.id, gatewayIds)),
		Promise.all(sessions.map(subtitleLabel))
	]);
	const userBy = new Map(users.map((u) => [u.id, u]));
	const movieBy = new Map(movies.map((m) => [m.id, m]));
	const episodeBy = new Map(episodes.map((e) => [e.id, e]));
	const gatewayBy = new Map(gateways.map((g) => [g.id, g.name]));
	const now = Date.now();

	return sessions.map((s, i): ActiveStream => {
		const file = s.source.file;
		const m = file.movieId ? movieBy.get(file.movieId) : undefined;
		const e = file.episodeId ? episodeBy.get(file.episodeId) : undefined;
		const title: PlayTitle = m
			? {
					kind: 'movie',
					title: m.title,
					seriesTitle: null,
					seasonNumber: null,
					episodeNumber: null,
					year: m.year,
					slug: m.slug,
					episodeSlug: null,
					posterUrl: m.posterUrl
				}
			: {
					kind: 'episode',
					title: e?.title ?? file.relPath.split('/').pop() ?? file.relPath,
					seriesTitle: e?.seriesTitle ?? null,
					seasonNumber: e?.seasonNumber ?? null,
					episodeNumber: e?.number ?? null,
					year: e?.seriesYear ?? null,
					slug: e?.seriesSlug ?? null,
					episodeSlug: e?.slug ?? null,
					posterUrl: e?.posterUrl ?? null
				};
		const u = s.userId ? userBy.get(s.userId) : undefined;
		return {
			sessionId: s.id,
			user: s.userId
				? { id: s.userId, name: u?.name ?? 'Deleted user', image: u?.image ?? null }
				: null,
			title,
			backdropUrl: m?.backdropUrl ?? e?.stillUrl ?? e?.backdropUrl ?? null,
			state: s.live.state,
			positionSeconds: s.live.positionSeconds,
			durationSeconds: s.live.durationSeconds ?? (file.durationMs ? file.durationMs / 1000 : null),
			startedAt: new Date(s.createdAt).toISOString(),
			platform: s.platform,
			mode: s.mode,
			quality: s.quality,
			streamWidth: s.mode === 'hls' ? (s.details.streamWidth ?? null) : null,
			source: {
				width: file.width,
				height: file.height,
				container: file.container,
				videoCodec: file.videoCodec,
				audioCodec: file.audioCodec,
				bitrate: file.bitrate
			},
			audioLabel: s.details.audioLabel ?? null,
			audioChannels: s.mode === 'hls' ? (s.details.audioChannels ?? null) : null,
			subtitleLabel: subtitleLabels[i],
			device: {
				id: s.source.gatewayId,
				name: gatewayBy.get(s.source.gatewayId) ?? 'Unknown device'
			},
			bitrateBps: s.rate.read(now),
			bytesSent: s.bytesSent,
			terminating: !!s.terminateMessage
		};
	});
}

async function subtitleLabel(session: HotSession): Promise<string | null> {
	const id = session.live.subtitleTrackId;
	if (!id) return null;
	const tracks = await listSubtitleTracks(session.source.file.id, session.id);
	return tracks.find((t) => t.id === id)?.label ?? null;
}
