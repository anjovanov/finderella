import { resolve } from '$app/paths';
import { byGenre, topRated, type MediaItem } from '$lib/data';
import { featured, listMovies, listSeries, recentlyAdded } from '$lib/server/catalog';
import { applyProgress, continueWatching, loadProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user?.id ?? null;
	const [hero, movies, series, recent, watching, progress] = await Promise.all([
		featured(),
		listMovies(),
		listSeries(),
		recentlyAdded(),
		continueWatching(userId),
		loadProgress(userId)
	]);
	for (const list of [movies, series, recent, watching, hero ? [hero] : []]) {
		applyProgress(list, progress);
	}
	const allItems = [...movies, ...series];
	const rows: { title: string; items: MediaItem[]; href?: string; continueWatching?: boolean }[] = [
		{ title: 'Continue watching', items: watching, continueWatching: true },
		{ title: 'Trending now', items: topRated(allItems) },
		{ title: 'New releases', items: recent },
		{ title: 'Movies', items: movies, href: resolve('/movies') },
		{ title: 'Series', items: series, href: resolve('/series') },
		{
			title: 'Mysteries & thrillers',
			items: [...new Set([...byGenre('Mystery', allItems), ...byGenre('Thriller', allItems)])]
		}
	];
	return { hero, rows: rows.filter((row) => row.items.length > 0) };
};
