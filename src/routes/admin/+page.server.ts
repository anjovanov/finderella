import { count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { gateway, library, mediaFile, movie, series, user } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { listActiveStreams } from '$lib/server/stats/activity';
import { safeTimeZone, TZ_COOKIE } from '$lib/server/stats/period';
import { recentlyAdded, recentlyWatched, summary } from '$lib/server/stats/queries';
import type { RecentlyAddedFile } from '$lib/data/stats';
import type { PageServerLoad } from './$types';

/** Newest files, one entry per movie / series; a series counts the new episodes it gained. */
function groupRecentlyAdded(files: RecentlyAddedFile[], limit: number) {
	const groups = new Map<string, RecentlyAddedFile & { newEpisodes: number }>();
	for (const file of files) {
		const key = `${file.title.kind}:${file.title.slug ?? file.id}`;
		const group = groups.get(key);
		if (group) group.newEpisodes++;
		else if (groups.size < limit) groups.set(key, { ...file, newEpisodes: 1 });
	}
	return [...groups.values()];
}

async function countRows(table: typeof movie | typeof series | typeof library | typeof user) {
	const [row] = await db.select({ n: count() }).from(table);
	return row?.n ?? 0;
}

export const load: PageServerLoad = async ({ cookies }) => {
	// The statistics pages store the admin's zone; until they've been visited it's UTC.
	const tz = safeTimeZone(cookies.get(TZ_COOKIE));
	const [
		gateways,
		fileCounts,
		libraries,
		movies,
		seriesCount,
		users,
		streams,
		week,
		recent,
		added
	] = await Promise.all([
		db.query.gateway.findMany({
			columns: { id: true, name: true, lastSeenAt: true },
			with: { libraries: { columns: { id: true } } },
			orderBy: [desc(gateway.createdAt)]
		}),
		db
			.select({ gatewayId: mediaFile.gatewayId, files: count() })
			.from(mediaFile)
			.where(eq(mediaFile.status, 'active'))
			.groupBy(mediaFile.gatewayId),
		countRows(library),
		countRows(movie),
		countRows(series),
		countRows(user),
		listActiveStreams(),
		summary(7, tz),
		recentlyWatched(6),
		recentlyAdded(100)
	]);
	const files = new Map(fileCounts.map((row) => [row.gatewayId, row.files]));
	const devices = gateways.map((g) => ({
		id: g.id,
		name: g.name,
		online: registry.isOnline(g.id),
		lastSeenAt: g.lastSeenAt?.toISOString() ?? null,
		libraries: g.libraries.length,
		files: files.get(g.id) ?? 0
	}));
	return {
		stats: {
			devices: { total: devices.length, online: devices.filter((d) => d.online).length },
			libraries,
			movies,
			series: seriesCount,
			files: fileCounts.reduce((sum, row) => sum + row.files, 0),
			users
		},
		devices,
		streams,
		week,
		recent,
		added: groupRecentlyAdded(added, 16)
	};
};
