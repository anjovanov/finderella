import type { GenericEndpointContext } from 'better-auth';
import { sessionsToEvict } from '$lib/data/account-limits';
import { log } from '$lib/server/log';
import { sessionLimit } from '$lib/server/site-settings';

type InternalAdapter = Pick<
	GenericEndpointContext['context']['internalAdapter'],
	'listSessions' | 'deleteSession'
>;

/** Better Auth's session row plus the fields our config adds (admin plugin, auth.ts). */
type StoredSession = Awaited<ReturnType<InternalAdapter['listSessions']>>[number] & {
	impersonatedBy?: string | null;
	lastActiveAt?: Date | null;
};

interface NewSession {
	id: string;
	userId: string;
	impersonatedBy?: unknown;
}

/**
 * Keep an account within the admin's signed-in device limit: after a sign-in
 * creates `created`, sign out the least recently used other sessions. Runs in
 * Better Auth's `databaseHooks.session.create.after`, so every sign-in path is
 * covered, and goes through its internal adapter (works with any session
 * storage). Admin impersonation sessions neither count nor trigger eviction.
 */
export async function enforceSessionLimit(
	created: NewSession,
	adapter: InternalAdapter
): Promise<void> {
	if (created.impersonatedBy) return;
	const limit = await sessionLimit();
	if (limit === null) return;

	const listed = await adapter.listSessions(created.userId, { onlyActiveSessions: true });
	const sessions = (listed as StoredSession[]).filter((s) => !s.impersonatedBy);
	const evict = new Set(
		sessionsToEvict(
			sessions.map((s) => ({
				id: s.id,
				lastUsed: new Date(s.lastActiveAt ?? s.updatedAt ?? s.createdAt)
			})),
			created.id,
			limit
		)
	);
	if (evict.size === 0) return;

	for (const s of sessions) {
		if (evict.has(s.id)) await adapter.deleteSession(s.token);
	}
	log.info({ userId: created.userId, limit, signedOut: evict.size }, 'session limit enforced');
}
