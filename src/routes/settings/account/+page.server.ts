import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { resolve } from '$app/paths';
import { isAdmin } from '$lib/auth-roles';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

const MIN_PASSWORD_LENGTH = 8;

/** The account form's fields; `fail()`s name the one an error belongs to. */
type AccountField = 'name' | 'email' | 'newPassword' | 'currentPassword';

export const load: PageServerLoad = ({ locals, url }) => {
	const u = locals.user!;
	return {
		account: {
			name: u.name,
			email: u.email,
			isAdmin: isAdmin(u),
			createdAt: u.createdAt.toISOString()
		},
		// The fields are locked until Edit (`?edit`, a link, so it works without JS).
		editing: url.searchParams.has('edit'),
		// What the last save changed (`?saved=name,email`, from the save redirect).
		saved: url.searchParams.get('saved')?.split(',').filter(Boolean) ?? []
	};
};

function failOn(field: AccountField | null, message: string, status = 400) {
	return fail(status, { field, message });
}

export const actions: Actions = {
	/**
	 * Saves whatever changed, in one go. The page only posts changed fields,
	 * but the action compares with the account anyway (a missing field or an
	 * unchanged value is left alone). Every check — including the current
	 * password, needed for an email or password change — runs before anything
	 * is written, so a mistake never leaves the save half applied.
	 */
	save: async (event) => {
		const formData = await event.request.formData();
		const me = event.locals.user!;
		const text = (key: AccountField) => {
			const value = formData.get(key);
			return typeof value === 'string' ? value : null;
		};

		const name = text('name')?.trim() ?? null;
		if (name === '') return failOn('name', 'Name is required');
		const nameChanged = name !== null && name !== me.name;

		const email = text('email')?.trim().toLowerCase() ?? null;
		const emailChanged = email !== null && email !== me.email.toLowerCase();
		if (emailChanged) {
			if (!z.email().safeParse(email).success) {
				return failOn('email', 'Enter a valid email address');
			}
			const taken = await db.query.user.findFirst({
				columns: { id: true },
				where: eq(user.email, email)
			});
			if (taken) return failOn('email', 'That email address is already in use', 409);
		}

		const newPassword = text('newPassword') ?? '';
		const passwordChanged = newPassword !== '';
		if (passwordChanged && newPassword.length < MIN_PASSWORD_LENGTH) {
			return failOn(
				'newPassword',
				`New password must be at least ${MIN_PASSWORD_LENGTH} characters`
			);
		}

		if (!nameChanged && !emailChanged && !passwordChanged) {
			return failOn(null, 'Nothing changed.');
		}

		const currentPassword = text('currentPassword') ?? '';
		if (emailChanged || passwordChanged) {
			if (!currentPassword) {
				return failOn(
					'currentPassword',
					'Enter your current password to change your email or password'
				);
			}
			try {
				await auth.api.verifyPassword({
					body: { password: currentPassword },
					headers: event.request.headers
				});
			} catch (error) {
				if (error instanceof APIError) return failOn('currentPassword', 'That password is wrong');
				throw error;
			}
		}

		try {
			if (nameChanged) {
				await auth.api.updateUser({ body: { name }, headers: event.request.headers });
			}
			if (emailChanged) {
				// The hub sends no email, so there is no verification round-trip:
				// Better Auth's changeEmail refuses users flagged as verified, hence
				// the direct update. Sessions reference the user id, so nothing else moves.
				await db.update(user).set({ email, emailVerified: false }).where(eq(user.id, me.id));
			}
			// Last: it replaces this session (fresh cookie) and signs every other
			// device out, so the calls above still run on the session they came with.
			if (passwordChanged) {
				await auth.api.changePassword({
					body: { currentPassword, newPassword, revokeOtherSessions: true },
					headers: event.request.headers
				});
			}
		} catch (error) {
			if (error instanceof APIError) return failOn(null, error.message || 'Request failed');
			return failOn(null, 'Unexpected error', 500);
		}

		// Back to the locked view; the page reads `saved` off the redirect to confirm.
		const saved = [nameChanged && 'name', emailChanged && 'email', passwordChanged && 'password']
			.filter(Boolean)
			.join(',');
		redirect(303, `${resolve('/settings/account')}?saved=${saved}`);
	}
};
