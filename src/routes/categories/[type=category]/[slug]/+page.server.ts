import { error } from '@sveltejs/kit';
import { categoryDetail } from '$lib/server/categories';
import { withProgress } from '$lib/server/progress';
import type { PageServerLoad } from './$types';
import { viewerProfileId } from '$lib/server/profiles';

export const load: PageServerLoad = async ({ params, locals }) => {
	const category = await categoryDetail(params.type, params.slug);
	if (!category) error(404, 'Category not found');
	const items = await withProgress(viewerProfileId(locals), category.items);
	return { ...category, items };
};
