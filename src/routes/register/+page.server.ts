import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { registrationStatus } from '$lib/server/site-settings';
import { displayNameFromEmail } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

const MIN_PASSWORD_LENGTH = 8;

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/');
	const status = await registrationStatus();
	return { firstUser: status.firstUser, registrationOpen: status.open };
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const values = { email };

		if (!email) return fail(400, { message: 'Email is required', ...values });
		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
				...values
			});
		}
		// Sign-up only asks for email + password; the display name starts as the
		// mailbox part and can be changed under /settings.
		const name = displayNameFromEmail(email);

		try {
			// Closed registration is enforced inside Better Auth (hooks.before in
			// src/lib/server/auth.ts) so the raw API endpoint is covered too.
			await auth.api.signUpEmail({ body: { email, password, name } });
		} catch (error) {
			if (error instanceof APIError) {
				const status = error.statusCode === 403 ? 403 : 400;
				return fail(status, { message: error.message || 'Sign up failed', ...values });
			}
			return fail(500, { message: 'Unexpected error', ...values });
		}
		redirect(302, '/');
	}
};
