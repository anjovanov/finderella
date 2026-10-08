import { db } from '$lib/server/db';
import { library } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import { getSiteSettings } from '$lib/server/site-settings';
import { scanDue } from '$lib/data/library-scanning';
import { registry } from './registry';
import { requestGatewayScans, requestScan, scanState } from './scan';

/** How often the hub looks for libraries due for their periodic rescan. */
const TICK_MS = 5 * 60_000;
/** A device that just connected may finish its hello burst (and settle a flapping link) first. */
const RECONNECT_SCAN_DELAY_MS = 30_000;
// On globalThis: the dev server re-runs `init` (and may re-instantiate this
// module) on edits, and the old interval must not keep ticking beside the new one.
const TIMER_KEY = '__finderellaScanScheduler';

/** Start (or restart) the periodic-rescan tick. Called from `init`. */
export function startScanScheduler(): void {
	const store = globalThis as Record<string, unknown>;
	clearInterval(store[TIMER_KEY] as ReturnType<typeof setInterval> | undefined);
	const timer = setInterval(() => {
		void runScheduledScans().catch((err) => log.error({ err }, 'scheduled scans failed'));
	}, TICK_MS);
	timer.unref?.();
	store[TIMER_KEY] = timer;
}

/** Request a rescan of every library on an online device whose last scan is older than the interval. */
export async function runScheduledScans(now = new Date()): Promise<void> {
	const { scanIntervalHours } = await getSiteSettings();
	if (!scanIntervalHours) return;
	const libraries = await db.select().from(library);
	for (const lib of libraries) {
		if (!registry.isOnline(lib.gatewayId) || scanState(lib.id) !== null) continue;
		if (scanDue(lib.lastScanAt, scanIntervalHours, now)) requestScan(lib, 'scheduled');
	}
}

const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * A device (re)connected: rescan its libraries, since folder watching missed
 * whatever changed while it was offline. Only while automatic scanning is on.
 */
export function scheduleReconnectScans(gatewayId: string): void {
	clearTimeout(reconnectTimers.get(gatewayId));
	const timer = setTimeout(() => {
		reconnectTimers.delete(gatewayId);
		void (async () => {
			const { watchLibraries, scanIntervalHours } = await getSiteSettings();
			if (!watchLibraries && !scanIntervalHours) return;
			if (registry.isOnline(gatewayId)) await requestGatewayScans(gatewayId, 'reconnect');
		})().catch((err) => log.error({ err, gatewayId }, 'reconnect scans failed'));
	}, RECONNECT_SCAN_DELAY_MS);
	timer.unref?.();
	reconnectTimers.set(gatewayId, timer);
}
