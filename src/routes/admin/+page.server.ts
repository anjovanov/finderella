import { count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { library, mediaFile, movie, series, user } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import type { PageServerLoad } from './$types';

async function countRows(table: typeof movie | typeof series | typeof library | typeof user) {
	const [row] = await db.select({ n: count() }).from(table);
	return row?.n ?? 0;
}

export const load: PageServerLoad = async () => {
	const [gateways, libraries, movies, seriesCount, users, files] = await Promise.all([
		db.query.gateway.findMany({ columns: { id: true, name: true, lastSeenAt: true } }),
		countRows(library),
		countRows(movie),
		countRows(series),
		countRows(user),
		db.select({ n: count() }).from(mediaFile).where(eq(mediaFile.status, 'active'))
	]);
	const online = gateways.filter((g) => registry.isOnline(g.id)).length;
	return {
		stats: {
			devices: { total: gateways.length, online },
			libraries,
			movies,
			series: seriesCount,
			files: files[0]?.n ?? 0,
			users
		}
	};
};
