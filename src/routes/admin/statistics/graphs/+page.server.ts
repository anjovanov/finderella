import { parsePeriod } from '$lib/data/stats';
import { graphData } from '$lib/server/stats/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { tz } = await parent();
	const days = parsePeriod(url.searchParams.get('days'));
	return { days, graphs: await graphData(days, tz) };
};
