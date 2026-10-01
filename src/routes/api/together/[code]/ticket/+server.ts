import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireProfile } from '$lib/server/profiles';
import { identityFor } from '$lib/server/together/identity';
import { togetherRooms } from '$lib/server/together/rooms';
import { issueTicket } from '$lib/server/together/tickets';

const TicketRequest = z.object({ resumeParticipantId: z.string().max(64).nullish() });

/**
 * A single-use ticket for the party's WebSocket (/ws/together?ticket=…): the
 * upgrade itself can't resolve the Better Auth session (see tickets.ts).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const profile = requireProfile(locals);
	const parsed = TicketRequest.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) error(400, 'expected { resumeParticipantId? }');
	if (!togetherRooms.get(params.code ?? '')) error(404, 'This watch party has ended.');
	const ticket = issueTicket({
		code: params.code ?? '',
		identity: identityFor(locals, profile),
		resumeId: parsed.data.resumeParticipantId ?? null
	});
	return json({ ticket });
};
