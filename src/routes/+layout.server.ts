import { isAdmin } from '$lib/auth-roles';
import { getPreferences } from '$lib/server/user-settings';
import type { LayoutServerLoad } from './$types';

/** The signed-in user as the site chrome needs it (null when logged out), plus their theme/screensaver. */
export const load: LayoutServerLoad = async ({ locals }) => {
	const u = locals.user;
	const preferences = await getPreferences(u?.id ?? null);
	// hooks.server.ts renders this into <html class> for the first paint.
	locals.theme = preferences.theme;
	return {
		user: u ? { name: u.name, email: u.email, image: u.image ?? null, isAdmin: isAdmin(u) } : null,
		preferences
	};
};
