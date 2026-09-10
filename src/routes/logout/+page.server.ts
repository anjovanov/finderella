import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { loginRequired } from '$lib/server/site-settings';
import type { Actions, PageServerLoad } from './$types';

// POST-only route: the navbar's "Sign out" submits here. A GET has nothing to
// render, so it just goes home.
export const load: PageServerLoad = () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		// A public hub can still be browsed after signing out.
		redirect(303, (await loginRequired()) ? '/login' : '/');
	}
};
