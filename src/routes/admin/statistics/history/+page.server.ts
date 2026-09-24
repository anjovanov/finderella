import { parsePeriod } from '$lib/data/stats';
import { history, userOptions } from '$lib/server/stats/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { tz } = await parent();
	const params = url.searchParams;
	// No `days` = all of history; the toggle narrows it.
	const days = params.has('days') ? parsePeriod(params.get('days')) : null;
	const kindParam = params.get('kind');
	const kind = kindParam === 'movie' || kindParam === 'episode' ? kindParam : undefined;
	const userId = params.get('user') || undefined;
	const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
	const [result, users] = await Promise.all([
		history({ page, userId, kind, days: days ?? undefined, tz }),
		userOptions()
	]);
	return { history: result, users, filter: { days, kind: kind ?? 'all', user: userId ?? 'all' } };
};
