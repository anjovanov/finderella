import { error, json, type RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/auth-roles';
import { markersJobStatus } from '$lib/server/markers/job';

/**
 * Progress of the intro & credits detection job, polled by /admin/devices
 * while a run is active. Endpoints skip the admin layout load, so the role
 * check lives here (see trickplay-status).
 */
export const GET: RequestHandler = ({ locals }) => {
	if (!isAdmin(locals.user)) error(403, 'This area is for administrators only.');
	return json(markersJobStatus());
};
