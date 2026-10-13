import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { movie, series, watchlist } from '$lib/server/db/schema';
import { getMoviesBySlugs, getSeriesBySlugs } from '$lib/server/catalog';
import type { MediaItem } from '$lib/data/types';

export type WatchlistKind = 'movie' | 'series';

/** Overlay key: the public slug prefixed by kind, so a movie and a series can share a slug. */
export function watchlistKey(kind: WatchlistKind, slug: string): string {
	return `${kind === 'movie' ? 'm' : 's'}:${slug}`;
}

/** Keys of everything the viewer saved (see `watchlistKey`). Guests (null) get an empty set. */
export async function loadWatchlistKeys(profileId: string | null): Promise<Set<string>> {
	const keys = new Set<string>();
	if (!profileId) return keys;
	const rows = await db
		.select({ movieSlug: movie.slug, seriesSlug: series.slug })
		.from(watchlist)
		.leftJoin(movie, eq(watchlist.movieId, movie.id))
		.leftJoin(series, eq(watchlist.seriesId, series.id))
		.where(eq(watchlist.profileId, profileId));
	for (const row of rows) {
		if (row.movieSlug) keys.add(watchlistKey('movie', row.movieSlug));
		else if (row.seriesSlug) keys.add(watchlistKey('series', row.seriesSlug));
	}
	return keys;
}

/** Save or unsave a title. Returns false when the slug doesn't exist. */
export async function toggleWatchlist(
	profileId: string,
	kind: WatchlistKind,
	slug: string,
	add: boolean
): Promise<boolean> {
	const target =
		kind === 'movie'
			? await db.query.movie.findFirst({ where: eq(movie.slug, slug), columns: { id: true } })
			: await db.query.series.findFirst({ where: eq(series.slug, slug), columns: { id: true } });
	if (!target) return false;
	const idColumn = kind === 'movie' ? watchlist.movieId : watchlist.seriesId;
	if (add) {
		// A bare ON CONFLICT DO NOTHING covers the partial unique indexes without a target.
		await db
			.insert(watchlist)
			.values({ profileId, [kind === 'movie' ? 'movieId' : 'seriesId']: target.id })
			.onConflictDoNothing();
	} else {
		await db
			.delete(watchlist)
			.where(and(eq(watchlist.profileId, profileId), eq(idColumn, target.id)));
	}
	return true;
}

/** The viewer's saved titles, most recently added first. */
export async function listWatchlist(profileId: string): Promise<MediaItem[]> {
	const rows = await db
		.select({ movieSlug: movie.slug, seriesSlug: series.slug })
		.from(watchlist)
		.leftJoin(movie, eq(watchlist.movieId, movie.id))
		.leftJoin(series, eq(watchlist.seriesId, series.id))
		.where(eq(watchlist.profileId, profileId))
		.orderBy(desc(watchlist.createdAt));
	// Rows whose title was pruned (left join → null slugs) are skipped.
	return itemsForKeys(
		rows.flatMap((r) =>
			r.movieSlug
				? [watchlistKey('movie', r.movieSlug)]
				: r.seriesSlug
					? [watchlistKey('series', r.seriesSlug)]
					: []
		)
	);
}

/** Catalog items for `watchlistKey`s, in the given order; unknown keys are dropped. */
export async function itemsForKeys(keys: string[]): Promise<MediaItem[]> {
	const slugs = (kind: WatchlistKind) => {
		const prefix = watchlistKey(kind, '');
		return keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
	};
	const [movies, shows] = await Promise.all([
		getMoviesBySlugs(slugs('movie')),
		getSeriesBySlugs(slugs('series'))
	]);
	const byKey = new Map<string, MediaItem>();
	for (const item of movies) byKey.set(watchlistKey('movie', item.id), item);
	for (const item of shows) byKey.set(watchlistKey('series', item.id), item);
	return keys.flatMap((key) => byKey.get(key) ?? []);
}
