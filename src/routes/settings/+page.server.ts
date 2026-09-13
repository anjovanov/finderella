import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { isAdmin } from '$lib/auth-roles';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import {
	getSubtitleSettings,
	saveSubtitleSettings,
	SubtitleSettingsPatch
} from '$lib/server/user-settings';
import type { Actions, PageServerLoad } from './$types';

const MIN_PASSWORD_LENGTH = 8;

export const load: PageServerLoad = async ({ locals }) => {
	const u = locals.user!;
	return {
		account: {
			name: u.name,
			email: u.email,
			isAdmin: isAdmin(u),
			createdAt: u.createdAt.toISOString()
		},
		subtitleSettings: await getSubtitleSettings(u.id)
	};
};

function failFrom(error: unknown, section: string) {
	if (error instanceof APIError) {
		return fail(400, { section, message: error.message || 'Request failed' });
	}
	return fail(500, { section, message: 'Unexpected error' });
}

export const actions: Actions = {
	updateSubtitles: async (event) => {
		const formData = await event.request.formData();
		const fields = ['language', 'size', 'color', 'background', 'position', 'font'] as const;
		const raw = Object.fromEntries(
			fields.flatMap((field) => {
				const value = formData.get(field);
				return typeof value === 'string' ? [[field, value]] : [];
			})
		);
		const parsed = SubtitleSettingsPatch.safeParse(raw);
		if (!parsed.success) {
			return fail(400, { section: 'subtitles', message: 'Pick a value from each list' });
		}
		await saveSubtitleSettings(event.locals.user!.id, parsed.data);
		return { section: 'subtitles', saved: true };
	},

	updateName: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		if (!name) return fail(400, { section: 'profile', message: 'Name is required' });
		try {
			await auth.api.updateUser({ body: { name }, headers: event.request.headers });
		} catch (error) {
			return failFrom(error, 'profile');
		}
		return { section: 'profile', saved: true };
	},

	updateEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
		if (!z.email().safeParse(email).success) {
			return fail(400, { section: 'email', message: 'Enter a valid email address' });
		}
		const me = event.locals.user!;
		if (email === me.email.toLowerCase()) {
			return fail(400, { section: 'email', message: 'That is already your email address' });
		}
		// The hub sends no email, so there is no verification round-trip:
		// Better Auth's changeEmail refuses users flagged as verified, hence the
		// direct update. Sessions reference the user id, so nothing else moves.
		const taken = await db.query.user.findFirst({
			columns: { id: true },
			where: eq(user.email, email)
		});
		if (taken)
			return fail(409, { section: 'email', message: 'That email address is already in use' });
		await db.update(user).set({ email, emailVerified: false }).where(eq(user.id, me.id));
		return { section: 'email', saved: true };
	},

	changePassword: async (event) => {
		const formData = await event.request.formData();
		const currentPassword = formData.get('currentPassword')?.toString() ?? '';
		const newPassword = formData.get('newPassword')?.toString() ?? '';
		if (!currentPassword) {
			return fail(400, { section: 'password', message: 'Enter your current password' });
		}
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				section: 'password',
				message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`
			});
		}
		try {
			// Signs every other device out; this session gets a fresh cookie.
			await auth.api.changePassword({
				body: { currentPassword, newPassword, revokeOtherSessions: true },
				headers: event.request.headers
			});
		} catch (error) {
			return failFrom(error, 'password');
		}
		return { section: 'password', saved: true };
	}
};
