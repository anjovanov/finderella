import { error } from '@sveltejs/kit';
import { getSeriesDetail } from '$lib/server/catalog';
import { applyProgress, loadProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';
import { moreLikeThis, resolveRecommended } from '$lib/server/recommendations';

export const load: PageServerLoad = async ({ params, locals }) => {
	const show = await getSeriesDetail(params.id);
	if (!show) error(404, 'Series not found');
	const [related, progress] = await Promise.all([
		moreLikeThis('series', show.id).then(resolveRecommended),
		loadProgress(viewerProfileId(locals))
	]);
	applyProgress([show, ...related], progress);
	return { show, related };
};
