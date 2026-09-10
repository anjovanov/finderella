import { asc, eq, isNotNull } from 'drizzle-orm';
import { ADMIN_ROLE, isAdmin } from '$lib/auth-roles';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { log } from '$lib/server/log';

/** Sign-up only asks for an email; the mailbox part is the initial display name. */
export function displayNameFromEmail(email: string): string {
	const local = email.split('@')[0]?.trim();
	return local || email || 'New user';
}

/** Admins who can still sign in (not banned). */
export async function listActiveAdmins(): Promise<{ id: string; email: string }[]> {
	const rows = await db.query.user.findMany({
		columns: { id: true, email: true, role: true, banned: true },
		where: isNotNull(user.role)
	});
	return rows.filter((u) => isAdmin(u) && !u.banned).map(({ id, email }) => ({ id, email }));
}

/** True when `userId` is the only admin left who could still sign in. */
export async function isLastActiveAdmin(userId: string): Promise<boolean> {
	const admins = await listActiveAdmins();
	return admins.length === 1 && admins[0].id === userId;
}

/**
 * Hubs that predate roles have users without one. Promote the oldest account
 * so the admin area stays reachable; idempotent, runs at boot.
 */
export async function ensureAdminExists(): Promise<void> {
	const admins = await listActiveAdmins();
	if (admins.length > 0) return;
	const oldest = await db.query.user.findFirst({
		columns: { id: true, email: true },
		orderBy: [asc(user.createdAt)]
	});
	if (!oldest) return;
	await db.update(user).set({ role: ADMIN_ROLE }).where(eq(user.id, oldest.id));
	log.warn({ email: oldest.email }, 'no admin account existed; promoted the oldest user');
}
