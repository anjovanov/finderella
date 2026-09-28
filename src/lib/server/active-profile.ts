import { auth } from '$lib/server/auth';

/**
 * Point a sign-in at one of its account's profiles (the caller has checked
 * ownership). `activeProfileId` is a Better Auth session additional field
 * with `input: false`, so the public /update-session endpoint refuses it;
 * the internal adapter is Better Auth's own server-side write path and keeps
 * any session cache (cookie cache / secondary storage) consistent.
 *
 * Kept out of $lib/server/profiles, which auth.ts imports (no import cycle).
 */
export async function setActiveProfile(sessionToken: string, profileId: string): Promise<void> {
	const ctx = await auth.$context;
	await ctx.internalAdapter.updateSession(sessionToken, { activeProfileId: profileId });
}
