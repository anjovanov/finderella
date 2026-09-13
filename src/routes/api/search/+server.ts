import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { searchCatalog } from '$lib/server/search';
import type { RequestHandler } from './$types';

/**
 * Instant search behind the navbar dropdown. Auth is the hook's job: with
 * `require_login` on, hooks.server.ts answers 401 before this runs; in guest
 * mode anyone who can browse can search.
 */
const Query = z.object({
	q: z.string().trim().max(200).default(''),
	limit: z.coerce.number().int().min(1).max(50).default(8)
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = Query.safeParse({
		q: url.searchParams.get('q') ?? '',
		limit: url.searchParams.get('limit') ?? undefined
	});
	if (!parsed.success) error(400, 'expected ?q=<text up to 200 chars>&limit=<1..50>');
	const { q, limit } = parsed.data;
	const results = q ? await searchCatalog(q, limit) : [];
	return json({ results }, { headers: { 'cache-control': 'no-store' } });
};
