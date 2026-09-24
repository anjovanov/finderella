import { db } from '$lib/server/db';
import { userActivity } from '$lib/server/db/schema';
import { log } from '$lib/server/log';

/** At most one `user_activity` write per account per this interval. */
const SEEN_WRITE_EVERY_MS = 5 * 60_000;

const lastWrite = new Map<string, number>();

/**
 * Record that an account is active ("Last seen" in admin statistics). Called
 * for every authenticated request and player heartbeat; throttled in memory
 * so it costs a DB write every few minutes per active user, not per request.
 */
export function markSeen(userId: string, userAgent: string | null): void {
	const now = Date.now();
	if (now - (lastWrite.get(userId) ?? 0) < SEEN_WRITE_EVERY_MS) return;
	lastWrite.set(userId, now);
	const values = { lastSeenAt: new Date(now), lastUserAgent: userAgent };
	void db
		.insert(userActivity)
		.values({ userId, ...values })
		.onConflictDoUpdate({ target: userActivity.userId, set: values })
		.catch((err) => {
			lastWrite.delete(userId);
			log.warn({ err, userId }, 'could not record user activity');
		});
}
