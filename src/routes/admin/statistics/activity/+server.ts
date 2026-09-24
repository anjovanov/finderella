import { error, json, type RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/auth-roles';
import { listActiveStreams } from '$lib/server/stats/activity';

// hooks.server.ts only gates non-GET requests under /admin (page GETs are gated by the
// layout load, which endpoints skip), so the role check lives here.
export const GET: RequestHandler = async ({ locals }) => {
	if (!isAdmin(locals.user)) error(403, 'This area is for administrators only.');
	return json(await listActiveStreams(), { headers: { 'cache-control': 'no-store' } });
};
