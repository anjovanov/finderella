import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { registrationOpen } from '$lib/server/site-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/');
	return { registrationOpen: await registrationOpen() };
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		try {
			// The headers give the new session its user agent and IP (Better Auth
			// stores "" without them), which /settings/devices shows.
			await auth.api.signInEmail({ body: { email, password }, headers: event.request.headers });
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Sign in failed', email });
			}
			return fail(500, { message: 'Unexpected error', email });
		}
		redirect(302, '/');
	}
};
