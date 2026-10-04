import { parsePeriod } from '$lib/data/stats';
import { requireProfile } from '$lib/server/profiles';
import { safeTimeZone, TZ_COOKIE } from '$lib/server/stats/period';
import {
	activityGraphs,
	profileFinished,
	profileWatchTimes,
	topMovies,
	topSeries
} from '$lib/server/stats/queries';
import type { PageServerLoad } from './$types';

/** The active profile's own watch statistics (a lighter /admin/statistics). */
export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const { id } = requireProfile(locals);
	const days = parsePeriod(url.searchParams.get('days'));
	// Bucketed on the viewer's calendar (the page sets the cookie; UTC until known).
	const tz = safeTimeZone(cookies.get(TZ_COOKIE));
	const [windows, finished, movies, shows, graphs] = await Promise.all([
		profileWatchTimes(id),
		profileFinished(id),
		topMovies(days, tz, 5, id),
		topSeries(days, tz, 5, id),
		activityGraphs(days, tz, id)
	]);
	return { days, tz, windows, finished, movies, shows, graphs };
};
