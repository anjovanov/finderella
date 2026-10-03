import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { sortAccountSessions } from '$lib/data/account-sessions';
import { listAccountSessions, sessionTokenFor } from '$lib/server/account-sessions';
import { auth } from '$lib/server/auth';
import { sessionLimit } from '$lib/server/site-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [sessions, limit] = await Promise.all([
		listAccountSessions(locals.user!.id, locals.session!.id),
		sessionLimit()
	]);
	return { sessions: sortAccountSessions(sessions), sessionLimit: limit };
};

function failFrom(error: unknown) {
	if (error instanceof APIError) {
		return fail(400, { message: error.message || 'Request failed' });
	}
	return fail(500, { message: 'Unexpected error' });
}

export const actions: Actions = {
	revoke: async (event) => {
		const formData = await event.request.formData();
		const sessionId = formData.get('sessionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { message: 'No device given' });
		if (sessionId === event.locals.session!.id) {
			return fail(400, { message: 'Use Sign out to leave this device' });
		}
		// The page only ever sees session ids; the token stays on the server.
		const token = await sessionTokenFor(event.locals.user!.id, sessionId);
		if (!token) return { revoked: true }; // already signed out or expired
		try {
			await auth.api.revokeSession({ body: { token }, headers: event.request.headers });
		} catch (error) {
			return failFrom(error);
		}
		return { revoked: true };
	},

	revokeOthers: async (event) => {
		try {
			await auth.api.revokeOtherSessions({ headers: event.request.headers });
		} catch (error) {
			return failFrom(error);
		}
		return { revoked: true };
	}
};
