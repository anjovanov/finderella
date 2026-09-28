import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Account is the default section. 307, not 308: browsers must not cache it.
export const load: PageServerLoad = () => redirect(307, '/settings/account');
