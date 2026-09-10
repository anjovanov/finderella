import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { ADMIN_ROLE, isAdmin, USER_ROLE } from '$lib/auth-roles';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { gateway, gatewayPairingCode } from '$lib/server/db/schema';
import { isLastActiveAdmin } from '$lib/server/users';
import type { Actions, PageServerLoad } from './$types';

const ROLES = new Set([USER_ROLE, ADMIN_ROLE]);

export const load: PageServerLoad = async (event) => {
	const { users } = await auth.api.listUsers({
		query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' },
		headers: event.request.headers
	});
	return {
		me: event.locals.user!.id,
		users: users.map((u) => ({
			id: u.id,
			name: u.name,
			email: u.email,
			role: u.role ?? USER_ROLE,
			isAdmin: isAdmin(u),
			banned: !!u.banned,
			banReason: u.banReason ?? null,
			createdAt: u.createdAt.toISOString()
		}))
	};
};

/** Turns a Better Auth error into a form failure with its message. */
function failFrom(error: unknown) {
	if (error instanceof APIError) {
		const status = error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 400;
		return fail(status, { message: error.message || 'Request failed' });
	}
	return fail(500, { message: 'Unexpected error' });
}

export const actions: Actions = {
	createUser: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const role = formData.get('role')?.toString() ?? USER_ROLE;
		if (!name || !email || !password) {
			return fail(400, { message: 'Name, email and password are required' });
		}
		if (password.length < 8)
			return fail(400, { message: 'Password must be at least 8 characters' });
		if (!ROLES.has(role)) return fail(400, { message: 'Unknown role' });
		try {
			// headers are required: without them createUser skips the admin check.
			await auth.api.createUser({
				body: { name, email, password, role: role as 'user' | 'admin' },
				headers: event.request.headers
			});
		} catch (error) {
			return failFrom(error);
		}
		return { created: email };
	},

	setRole: async (event) => {
		const formData = await event.request.formData();
		const userId = formData.get('userId')?.toString() ?? '';
		const role = formData.get('role')?.toString() ?? '';
		if (!userId || !ROLES.has(role)) return fail(400, { message: 'User and role are required' });
		if (userId === event.locals.user!.id) {
			return fail(400, { message: 'You cannot change your own role' });
		}
		if (role !== ADMIN_ROLE && (await isLastActiveAdmin(userId))) {
			return fail(400, { message: 'That user is the last administrator' });
		}
		try {
			await auth.api.setRole({
				body: { userId, role: role as 'user' | 'admin' },
				headers: event.request.headers
			});
		} catch (error) {
			return failFrom(error);
		}
		return { updated: userId };
	},

	ban: async (event) => {
		const formData = await event.request.formData();
		const userId = formData.get('userId')?.toString() ?? '';
		const banReason = formData.get('reason')?.toString().trim() || undefined;
		if (!userId) return fail(400, { message: 'Missing user' });
		if (await isLastActiveAdmin(userId)) {
			return fail(400, { message: 'That user is the last administrator' });
		}
		try {
			// The plugin refuses to ban the acting admin and revokes the target's sessions.
			await auth.api.banUser({ body: { userId, banReason }, headers: event.request.headers });
		} catch (error) {
			return failFrom(error);
		}
		return { banned: userId };
	},

	unban: async (event) => {
		const formData = await event.request.formData();
		const userId = formData.get('userId')?.toString() ?? '';
		if (!userId) return fail(400, { message: 'Missing user' });
		try {
			await auth.api.unbanUser({ body: { userId }, headers: event.request.headers });
		} catch (error) {
			return failFrom(error);
		}
		return { unbanned: userId };
	},

	remove: async (event) => {
		const formData = await event.request.formData();
		const userId = formData.get('userId')?.toString() ?? '';
		if (!userId) return fail(400, { message: 'Missing user' });
		if (await isLastActiveAdmin(userId)) {
			return fail(400, { message: 'That user is the last administrator' });
		}
		// gateway.paired_by_user_id / pairing codes reference user.id without
		// cascade: hand the devices to the acting admin and drop their codes so
		// the delete doesn't hit a foreign-key violation. (Watch history and
		// playback sessions cascade on their own.)
		const me = event.locals.user!.id;
		await db.update(gateway).set({ pairedByUserId: me }).where(eq(gateway.pairedByUserId, userId));
		await db.delete(gatewayPairingCode).where(eq(gatewayPairingCode.createdByUserId, userId));
		try {
			// The plugin refuses to remove the acting admin.
			await auth.api.removeUser({ body: { userId }, headers: event.request.headers });
		} catch (error) {
			return failFrom(error);
		}
		return { removed: userId };
	}
};
