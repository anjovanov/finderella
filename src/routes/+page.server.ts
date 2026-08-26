import { resolve } from '$app/paths';
import { byGenre, topRated } from '$lib/data';
import { featured, listMovies, listSeries, recentlyAdded } from '$lib/server/catalog';
import { continueWatching } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [hero, movies, series, recent, watching] = await Promise.all([
		featured(),
		listMovies(),
		listSeries(),
		recentlyAdded(),
		continueWatching(locals.user!.id)
	]);
	const allItems = [...movies, ...series];
	return {
		hero,
		rows: [
			{ title: 'Continue watching', items: watching },
			{ title: 'Trending now', items: topRated(allItems) },
			{ title: 'New releases', items: recent },
			{ title: 'Movies', items: movies, href: resolve('/movies') },
			{ title: 'Series', items: series, href: resolve('/series') },
			{
				title: 'Mysteries & thrillers',
				items: [...new Set([...byGenre('Mystery', allItems), ...byGenre('Thriller', allItems)])]
			}
		].filter((row) => row.items.length > 0)
	};
};
