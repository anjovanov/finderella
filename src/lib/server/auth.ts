import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { roleForNewUser, USER_ROLE } from '$lib/auth-roles';
import { db } from '$lib/server/db';
import { log } from '$lib/server/log';
import { ensurePrimaryProfile } from '$lib/server/profiles';
import { enforceSessionLimit } from '$lib/server/session-limit';
import { countUsers, registrationOpen } from '$lib/server/site-settings';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailAndPassword: { enabled: true },
	session: {
		additionalFields: {
			// The profile this sign-in is watching as (see $lib/server/profiles).
			// Per device like any streaming service, gone on sign-out. Written by
			// the server only (`input: false` keeps /update-session from setting
			// it) and validated against the user's profiles on every request.
			activeProfileId: { type: 'string', required: false, input: false },
			// "Last used" on /settings/devices. Better Auth's own updatedAt moves
			// only on the daily refresh, so markSessionActive
			// ($lib/server/account-sessions) stamps this every few minutes.
			lastActiveAt: { type: 'date', required: false, input: false }
		}
	},
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
				},
				// Every account starts with its primary profile (sign-up and
				// admin-created users alike); hooks.server.ts re-creates a missing one.
				after: async (user) => {
					await ensurePrimaryProfile(user.id, user.name);
				}
			}
		},
		session: {
			create: {
				// The admin's signed-in device limit: a new sign-in signs out the
				// least recently used sessions. Best effort — a failure here must
				// never fail the sign-in itself.
				after: async (session, ctx) => {
					if (!ctx) {
						log.warn({ userId: session.userId }, 'session limit skipped: no auth context');
						return;
					}
					try {
						await enforceSessionLimit(session, ctx.context.internalAdapter);
					} catch (err) {
						log.warn({ err, userId: session.userId }, 'could not enforce the session limit');
					}
				}
			}
		}
	},
	plugins: [
		admin({ defaultRole: USER_ROLE }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
