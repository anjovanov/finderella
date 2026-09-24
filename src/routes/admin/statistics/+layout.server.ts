import { safeTimeZone, TZ_COOKIE } from '$lib/server/stats/period';
import type { LayoutServerLoad } from './$types';

/** The zone the statistics are bucketed in (the admin's browser, via cookie; UTC until known). */
export const load: LayoutServerLoad = ({ cookies }) => {
	return { tz: safeTimeZone(cookies.get(TZ_COOKIE)) };
};
