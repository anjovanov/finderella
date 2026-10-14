import { resolve } from '$app/paths';
import { byGenre, type MediaItem } from '$lib/data';
import { featured, listMovies, listSeries, newReleases, recentlyAdded } from '$lib/server/catalog';
import { applyProgress, continueWatching, loadProgress } from '$lib/server/progress';
import { homeRecommendations } from '$lib/server/recommendations';
import { watchlistKey } from '$lib/server/watchlist';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';

type Row = { title: string; items: MediaItem[]; href?: string; continueWatching?: boolean };

export const load: PageServerLoad = async ({ locals }) => {
	const profileId = viewerProfileId(locals);
	const progressPromise = loadProgress(profileId);
	const [hero, movies, series, recent, releases, watching, progress, recommended] =
		await Promise.all([
			featured(),
			listMovies(),
			listSeries(),
			recentlyAdded(),
			newReleases(),
			progressPromise.then((overlay) => continueWatching(profileId, overlay)),
			progressPromise,
			homeRecommendations(profileId)
		]);
	for (const list of [movies, series, recent, releases, watching, hero ? [hero] : []]) {
		applyProgress(list, progress);
	}
	const allItems = [...movies, ...series];
	const byKey = new Map(allItems.map((item) => [watchlistKey(item.kind, item.id), item]));
	const items = (keys: string[]) => keys.flatMap((key) => byKey.get(key) ?? []);

	// "Because you watched …" rows; the year disambiguates two seeds sharing a title
	// (rows are keyed by title).
	const because: Row[] = [];
	for (const row of recommended.because) {
		const seed = byKey.get(row.seedKey);
		if (!seed) continue;
		let title = `Because you watched ${seed.title}`;
		if (because.some((r) => r.title === title)) title += ` (${seed.year})`;
		because.push({ title, items: items(row.keys) });
	}

	const rows: (Row | undefined)[] = [
		{ title: 'Continue watching', items: watching, continueWatching: true },
		{
			title: recommended.personal ? 'Top picks for you' : 'Popular picks',
			items: items(recommended.topPicks)
		},
		{ title: 'Trending now', items: items(recommended.trending) },
		because[0],
		{ title: 'New releases', items: releases },
		because[1],
		{ title: 'Just added', items: recent },
		{ title: 'Movies', items: movies, href: resolve('/movies') },
		{ title: 'Series', items: series, href: resolve('/series') },
		{
			title: 'Mysteries & thrillers',
			items: [...new Set([...byGenre('Mystery', allItems), ...byGenre('Thriller', allItems)])]
		}
	];
	return { hero, rows: rows.filter((row): row is Row => !!row && row.items.length > 0) };
};
