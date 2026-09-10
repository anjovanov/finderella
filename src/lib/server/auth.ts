import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { roleForNewUser, USER_ROLE } from '$lib/auth-roles';
import { db } from '$lib/server/db';
import { countUsers, registrationOpen } from '$lib/server/site-settings';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	hooks: {
		// Public sign-up honours the admin's "allow registration" switch. This
		// runs for both the /register form action (auth.api.signUpEmail) and the
		// raw POST /api/auth/sign-up/email endpoint. Admin-created users go
		// through /admin/create-user and are unaffected.
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== '/sign-up/email') return;
			if (await registrationOpen()) return;
			throw new APIError('FORBIDDEN', { message: 'Registration is closed on this server.' });
		})
	},
	databaseHooks: {
		user: {
			create: {
				// The first account on an empty hub is the administrator. Plugin
				// hooks (the admin plugin's default role) run before this one, so
				// the role returned here wins.
				before: async (user) => {
					const existing = await countUsers();
					const requested = (user as { role?: string | null }).role;
					return { data: { ...user, role: roleForNewUser(existing, requested) } };
				}
			}
		}
	},
	plugins: [
		admin({ defaultRole: USER_ROLE }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
