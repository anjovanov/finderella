import { fail } from '@sveltejs/kit';
import { parsePeriod } from '$lib/data/stats';
import { listActiveStreams } from '$lib/server/stats/activity';
import {
	recentlyWatched,
	summary,
	topMovies,
	topPlatforms,
	topSeries,
	topUsers
} from '$lib/server/stats/queries';
import { sessionManager } from '$lib/server/streaming/session-manager';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { tz } = await parent();
	const days = parsePeriod(url.searchParams.get('days'));
	const [streams, totals, movies, shows, users, platforms, recent] = await Promise.all([
		listActiveStreams(),
		summary(days, tz),
		topMovies(days, tz),
		topSeries(days, tz),
		topUsers(days, tz),
		topPlatforms(days, tz),
		recentlyWatched()
	]);
	return { days, streams, totals, movies, shows, users, platforms, recent };
};

export const actions: Actions = {
	/** Admin "Stop stream": the viewer's player shows the message on its next heartbeat. */
	terminate: async ({ request }) => {
		const form = await request.formData();
		const sessionId = String(form.get('sessionId') ?? '');
		const ok = sessionManager.requestTermination(
			sessionId,
			'Playback was stopped by an administrator.'
		);
		if (!ok) return fail(404, { message: 'That stream has already ended.' });
		return { stopped: sessionId };
	}
};
