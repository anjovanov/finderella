import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/auth-roles';
import { SIDEBAR_COOKIE_NAME } from '$lib/components/ui/sidebar/constants';
import type { LayoutServerLoad } from './$types';

// hooks.server.ts already refuses non-admins for /admin*; this is the
// defence-in-depth check for the layout tree itself.
export const load: LayoutServerLoad = ({ locals, cookies }) => {
	if (!isAdmin(locals.user)) error(403, 'This area is for administrators only.');
	return { sidebarOpen: cookies.get(SIDEBAR_COOKIE_NAME) !== 'false' };
};
