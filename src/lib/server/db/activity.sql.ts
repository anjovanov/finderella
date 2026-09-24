import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

/**
 * When each account was last active on the hub (admin statistics). Written
 * from hooks.server.ts and player heartbeats, throttled per user in memory
 * ($lib/server/stats/seen).
 */
export const userActivity = pgTable('user_activity', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
	lastUserAgent: text('last_user_agent')
});
