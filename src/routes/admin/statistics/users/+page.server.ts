import { USER_SORT_KEYS, type UserSortKey } from '$lib/data/stats';
import { userStats } from '$lib/server/stats/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const params = url.searchParams;
	const sortParam = params.get('sort');
	const sort: UserSortKey = USER_SORT_KEYS.includes(sortParam as UserSortKey)
		? (sortParam as UserSortKey)
		: 'lastSeen';
	// Names read A→Z first, everything else newest/largest first.
	const dirParam = params.get('dir');
	const desc = dirParam === 'asc' ? false : dirParam === 'desc' ? true : sort !== 'name';
	const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
	return { ...(await userStats({ page, sort, desc })), sort: { key: sort, desc } };
};
