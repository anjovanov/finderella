import { error, json, type RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/auth-roles';
import { bulkStatus } from '$lib/server/subtitles/bulk';

/**
 * Progress of the bulk/auto download job, polled by /admin/subtitles while a
 * run is active. hooks.server.ts only gates non-GET requests under /admin
 * (page GETs are gated by the layout load, which endpoints skip), so the
 * role check lives here.
 */
export const GET: RequestHandler = ({ locals }) => {
	if (!isAdmin(locals.user)) error(403, 'This area is for administrators only.');
	return json(bulkStatus());
};
