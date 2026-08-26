import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { agent, agentPairingCode } from '$lib/server/db/schema';
import { log } from '$lib/server/log';

const PairRequest = z.object({
	code: z.string().min(4).max(32),
	name: z.string().min(1).max(64).optional()
});

/**
 * Agent pairing (public route — the agent has no session). The user generates
 * a short-lived claim code in /settings/devices; the agent presents it once
 * and receives its long-lived bearer token. Only the sha256 of the token is
 * stored.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'invalid JSON body');
	}
	const parsed = PairRequest.safeParse(body);
	if (!parsed.success) error(400, 'expected { code, name? }');

	const code = parsed.data.code.trim().toUpperCase();
	const row = await db.query.agentPairingCode.findFirst({
		where: and(
			eq(agentPairingCode.code, code),
			isNull(agentPairingCode.claimedByAgentId),
			gt(agentPairingCode.expiresAt, new Date())
		)
	});
	if (!row) error(403, 'invalid, expired, or already-used pairing code');

	const token = randomBytes(32).toString('hex');
	const tokenHash = createHash('sha256').update(token).digest('hex');
	const [created] = await db
		.insert(agent)
		.values({
			name: parsed.data.name ?? row.agentName,
			tokenHash,
			pairedByUserId: row.createdByUserId
		})
		.returning({ id: agent.id, name: agent.name });
	await db
		.update(agentPairingCode)
		.set({ claimedByAgentId: created.id })
		.where(eq(agentPairingCode.id, row.id));

	log.info({ agentId: created.id, name: created.name }, 'agent paired');
	return json({ agentId: created.id, name: created.name, token });
};
