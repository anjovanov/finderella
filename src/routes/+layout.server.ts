import { isAdmin } from '$lib/auth-roles';
import { viewerProfileId } from '$lib/server/profiles';
import { getPreferences } from '$lib/server/profile-settings';
import type { LayoutServerLoad } from './$types';

/**
 * The signed-in user as the site chrome needs it (null when logged out), the
 * active profile + the account's other profiles (navbar switcher), and the
 * profile's theme/screensaver.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const u = locals.user;
	const preferences = await getPreferences(viewerProfileId(locals));
	// hooks.server.ts renders this into <html class> for the first paint.
	locals.theme = preferences.theme;
	return {
		user: u ? { name: u.name, email: u.email, image: u.image ?? null, isAdmin: isAdmin(u) } : null,
		profile: locals.profile ?? null,
		profiles: locals.profiles ?? [],
		preferences
	};
};
