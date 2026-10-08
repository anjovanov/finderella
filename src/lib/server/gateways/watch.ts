import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { library } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import { getSiteSettings } from '$lib/server/site-settings';
import { registry } from './registry';

/**
 * Tell a device which of its library folders to watch (`libraries.watch`
 * replaces its list; empty = stop). Sent after every `hello` (the device drops
 * its watchers on disconnect), when libraries come or go, and when the admin
 * setting changes. Best effort: an offline or older device is skipped.
 */
export async function syncWatchedLibraries(gatewayId: string): Promise<void> {
	if (!registry.get(gatewayId)?.capabilities.watch) return;
	const { watchLibraries } = await getSiteSettings();
	const libraries = watchLibraries
		? await db
				.select({ libraryId: library.id, rootPath: library.rootPath })
				.from(library)
				.where(eq(library.gatewayId, gatewayId))
		: [];
	try {
		registry.send(gatewayId, { type: 'libraries.watch', libraries });
	} catch (err) {
		log.debug({ err, gatewayId }, 'libraries.watch not sent');
	}
}

/** The watch setting changed: update every connected device. */
export async function syncAllWatchedLibraries(): Promise<void> {
	await Promise.all(registry.list().map((gw) => syncWatchedLibraries(gw.gatewayId)));
}
