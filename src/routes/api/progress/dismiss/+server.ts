import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { dismissProgress } from '$lib/server/progress';

const DismissRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1)
});

/** Remove a title from "Continue watching" (progress is kept; playing again restores it). */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401, 'Sign in to manage Continue watching.');
	const parsed = DismissRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug }');
	const found = await dismissProgress(user.id, parsed.data.kind, parsed.data.slug);
	if (!found) error(404, 'Title not found');
	return json({ ok: true });
};
