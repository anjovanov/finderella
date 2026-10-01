import { randomBytes } from 'node:crypto';
import type { TogetherIdentity } from './room';

/**
 * Single-use WebSocket tickets. The upgrade request can't run Better Auth's
 * `getSession` (its sveltekitCookies plugin needs a SvelteKit request event and
 * throws outside one), so an ordinary authenticated POST mints a short-lived
 * ticket that carries the account + active profile, and the socket presents it.
 */

export const TICKET_TTL_MS = 30_000;

export interface Ticket {
	code: string;
	identity: TogetherIdentity;
	/** Re-attach this seat (reconnects within the grace period). */
	resumeId: string | null;
	expiresAt: number;
}

const tickets = new Map<string, Ticket>();

export function issueTicket(entry: Omit<Ticket, 'expiresAt'>): string {
	sweep();
	const token = randomBytes(24).toString('base64url');
	tickets.set(token, { ...entry, expiresAt: Date.now() + TICKET_TTL_MS });
	return token;
}

export function consumeTicket(token: string | null): Ticket | null {
	if (!token) return null;
	const ticket = tickets.get(token);
	tickets.delete(token);
	if (!ticket || ticket.expiresAt < Date.now()) return null;
	return ticket;
}

function sweep(): void {
	const now = Date.now();
	for (const [token, ticket] of tickets) if (ticket.expiresAt < now) tickets.delete(token);
}
