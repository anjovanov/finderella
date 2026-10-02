import { error } from '@sveltejs/kit';
import { history, USER_HISTORY_PAGE_SIZE, userDetail } from '$lib/server/stats/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { tz } = await parent();
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
	const [detail, recent] = await Promise.all([
		userDetail(params.id),
		history({ page, perPage: USER_HISTORY_PAGE_SIZE, userId: params.id, tz })
	]);
	if (!detail) error(404, 'No such user.');
	return { detail, recent };
};
