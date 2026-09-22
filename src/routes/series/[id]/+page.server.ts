import { error } from '@sveltejs/kit';
import { byGenre } from '$lib/data';
import { getSeriesDetail, listAllItems } from '$lib/server/catalog';
import { applyProgress, loadProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const show = await getSeriesDetail(params.id);
	if (!show) error(404, 'Series not found');
	const related =
		show.genres.length > 0
			? byGenre(show.genres[0], await listAllItems()).filter((i) => i.id !== show.id)
			: [];
	const progress = await loadProgress(locals.user?.id ?? null);
	applyProgress([show, ...related], progress);
	return { show, related };
};
