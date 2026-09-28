import { categoryIndex } from '$lib/server/categories';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ index: await categoryIndex() });
