/** Admin-set account limits (site settings). `null` everywhere means unlimited. */

/** Profiles per account until an admin changes it (the former fixed cap). */
export const DEFAULT_MAX_PROFILES = 5;
/** Bounds an admin can set either limit to. */
export const LIMIT_MIN = 1;
export const LIMIT_MAX = 99;

export function canAddProfile(count: number, limit: number | null): boolean {
	return limit === null || count < limit;
}

/**
 * Sessions to sign out after `newSessionId` was created so the account is back
 * at `limit`: the least recently used first, never the new one. A limit
 * lowered while an account was over it is enforced in full here, at the
 * account's next sign-in.
 */
export function sessionsToEvict(
	sessions: { id: string; lastUsed: Date }[],
	newSessionId: string,
	limit: number | null
): string[] {
	if (limit === null || sessions.length <= limit) return [];
	return sessions
		.filter((s) => s.id !== newSessionId)
		.sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime())
		.slice(0, sessions.length - limit)
		.map((s) => s.id);
}
