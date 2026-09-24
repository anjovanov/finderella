import { error } from '@sveltejs/kit';
import { history, userDetail } from '$lib/server/stats/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { tz } = await parent();
	const [detail, recent] = await Promise.all([
		userDetail(params.id),
		history({ page: 1, userId: params.id, tz })
	]);
	if (!detail) error(404, 'No such user.');
	return { detail, recent };
};
