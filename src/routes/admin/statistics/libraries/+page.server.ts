import { libraryBreakdowns, libraryStats, recentlyAdded } from '$lib/server/stats/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
	const libraries = await libraryStats(page);
	const requested = url.searchParams.get('library');
	// Breakdowns cover one library or all of them.
	const libraryId = libraries.options.some((l) => l.id === requested) ? requested! : undefined;
	const [breakdowns, recent] = await Promise.all([
		libraryBreakdowns(libraryId),
		recentlyAdded(12, libraryId)
	]);
	return { libraries, libraryId: libraryId ?? 'all', breakdowns, recent };
};
