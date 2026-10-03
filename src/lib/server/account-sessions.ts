import { and, eq, gt } from 'drizzle-orm';
import type { AccountSession } from '$lib/data/account-sessions';
import { db } from '$lib/server/db';
import { session } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import { parseUserAgent } from '$lib/server/stats/user-agent';

/** `session.last_active_at` moves at most this often ("last used" is that coarse). */
const ACTIVE_WRITE_EVERY_MS = 5 * 60_000;

/** Sessions with a write in flight, so a burst of requests writes once. */
const pending = new Set<string>();

/**
 * Stamp a session as used now. Called for every authenticated request with
 * the row `getSession` just loaded, so the throttle needs no extra read.
 *
 * Sessions created by server-side sign-in calls without request headers have
 * an empty `userAgent` (Better Auth stores ""); the request's own header fills
 * it in once, so those devices stop showing as "Unknown device".
 */
export function markSessionActive(
	current: { id: string; lastActiveAt?: Date | null; userAgent?: string | null },
	requestUserAgent: string | null
): void {
	const now = Date.now();
	const last = current.lastActiveAt ? new Date(current.lastActiveAt).getTime() : 0;
	const fillUserAgent = !current.userAgent && !!requestUserAgent;
	if ((now - last < ACTIVE_WRITE_EVERY_MS && !fillUserAgent) || pending.has(current.id)) return;
	pending.add(current.id);
	void db
		.update(session)
		.set({
			lastActiveAt: new Date(now),
			...(fillUserAgent ? { userAgent: requestUserAgent } : {})
		})
		.where(eq(session.id, current.id))
		.catch((err) => log.warn({ err, sessionId: current.id }, 'could not record session activity'))
		.finally(() => pending.delete(current.id));
}

/**
 * The account's unexpired sessions for /settings/devices. Read straight from
 * the table: `auth.api.listSessions` refuses sessions older than `freshAge`
 * (403 SESSION_NOT_FRESH), and its rows carry the token, which is the
 * credential itself. Neither tokens nor IP addresses leave this function.
 */
export async function listAccountSessions(
	userId: string,
	currentId: string
): Promise<AccountSession[]> {
	const rows = await db
		.select({
			id: session.id,
			userAgent: session.userAgent,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			lastActiveAt: session.lastActiveAt
		})
		.from(session)
		.where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())));
	return rows.map((row) => {
		const { browser, os, deviceType } = parseUserAgent(row.userAgent);
		return {
			id: row.id,
			browser,
			os,
			deviceType,
			lastActiveAt: (row.lastActiveAt ?? row.updatedAt ?? row.createdAt).toISOString(),
			current: row.id === currentId
		};
	});
}

/** The token `auth.api.revokeSession` needs, only for one of `userId`'s own sessions. */
export async function sessionTokenFor(userId: string, sessionId: string): Promise<string | null> {
	const [row] = await db
		.select({ token: session.token })
		.from(session)
		.where(and(eq(session.id, sessionId), eq(session.userId, userId)))
		.limit(1);
	return row?.token ?? null;
}
