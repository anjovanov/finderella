import { isAdmin } from '$lib/auth-roles';
import type { LayoutServerLoad } from './$types';

/** The signed-in user as the site chrome needs it (null when logged out). */
export const load: LayoutServerLoad = ({ locals }) => {
	const u = locals.user;
	return {
		user: u ? { name: u.name, email: u.email, image: u.image ?? null, isAdmin: isAdmin(u) } : null
	};
};
