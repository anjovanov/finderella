import { error, json, type RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/auth-roles';
import { trickplayBulkStatus } from '$lib/server/trickplay/bulk';

/**
 * Progress of the "Generate thumbnails" job, polled by /admin/devices while a
 * run is active. hooks.server.ts only gates non-GET requests under /admin
 * (page GETs are gated by the layout load, which endpoints skip), so the
 * role check lives here.
 */
export const GET: RequestHandler = ({ locals }) => {
	if (!isAdmin(locals.user)) error(403, 'This area is for administrators only.');
	return json(trickplayBulkStatus());
};
