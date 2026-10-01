import { z } from 'zod';
import {
	CHAT_MAX_LENGTH,
	TOGETHER_REACTIONS,
	type TogetherClientMessage
} from '$lib/data/together';
import { LABEL_MAX_LENGTH } from './room';

const position = z
	.number()
	.min(0)
	.max(7 * 24 * 3600);
const slug = z.string().min(1).max(200);

export const TogetherMediaSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('movie'), slug }),
	z.object({ kind: z.literal('series'), slug, episodeSlug: slug })
]);

const ClientMessage = z.discriminatedUnion('type', [
	z.object({ type: z.literal('play'), position }),
	z.object({ type: z.literal('pause'), position }),
	z.object({ type: z.literal('seek'), position }),
	z.object({ type: z.literal('ready'), seq: z.number().int().min(0) }),
	z.object({ type: z.literal('buffering'), position }),
	z.object({
		type: z.literal('media'),
		media: TogetherMediaSchema,
		label: z.string().max(LABEL_MAX_LENGTH * 2)
	}),
	// Over-long text is trimmed by the room rather than rejected.
	z.object({ type: z.literal('chat'), text: z.string().max(CHAT_MAX_LENGTH * 4) }),
	z.object({ type: z.literal('react'), emoji: z.enum(TOGETHER_REACTIONS) }),
	z.object({ type: z.literal('kick'), participantId: z.string().max(64) }),
	z.object({ type: z.literal('end') }),
	z.object({ type: z.literal('ping'), t0: z.number() })
]);

export function parseClientMessage(raw: string): TogetherClientMessage | null {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	const parsed = ClientMessage.safeParse(json);
	return parsed.success ? parsed.data : null;
}
