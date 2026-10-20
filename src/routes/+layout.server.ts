import { isAdmin } from '$lib/auth-roles';
import { viewerProfileId } from '$lib/server/profiles';
import { getPreferences } from '$lib/server/profile-settings';
import { getBranding } from '$lib/server/site-settings';
import { SOURCE_LOCALE } from '$lib/data/locale';
import type { LayoutServerLoad } from './$types';

/**
 * The signed-in user as the site chrome needs it (null when logged out), the
 * active profile + the account's other profiles (navbar switcher), and the
 * profile's theme/screensaver, the hub's branding (name, accent, fonts) and the
 * request's UI language.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const u = locals.user;
	const [preferences, branding] = await Promise.all([
		getPreferences(viewerProfileId(locals)),
		getBranding()
	]);
	// hooks.server.ts renders this into <html class> for the first paint.
	locals.theme = preferences.theme;
	return {
		user: u ? { name: u.name, email: u.email, image: u.image ?? null, isAdmin: isAdmin(u) } : null,
		profile: locals.profile ?? null,
		profiles: locals.profiles ?? [],
		preferences,
		branding,
		// hooks.server.ts resolved it (profile's pick, else the hub's default);
		// the root +layout.ts loads the client's catalogs for it.
		locale: locals.locale ?? SOURCE_LOCALE
	};
};
