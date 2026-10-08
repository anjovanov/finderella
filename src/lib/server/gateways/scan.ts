import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { library } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import { queueDeviceEvent } from './events';
import { registry } from './registry';
import {
	ScanCoordinator,
	type ActiveScan,
	type ScanReason,
	type ScanRequestOutcome,
	type ScanTarget
} from './scan-coordinator';

export type { ScanReason, ScanTarget } from './scan-coordinator';

/** Single-process hub: one coordinator for every device (see scan-coordinator.ts). */
const coordinator = new ScanCoordinator({
	isOnline: (gatewayId) => registry.isOnline(gatewayId),
	start: ({ target, force }) => {
		registry.send(target.gatewayId, {
			type: 'scan.start',
			libraryId: target.id,
			rootPath: target.rootPath,
			kind: target.kind,
			...(force ? { force } : {})
		});
	},
	onStarted: ({ target, reason, actorUserId }) => {
		log.info({ libraryId: target.id, gatewayId: target.gatewayId, reason }, 'scan requested');
		// Automatic scans only show up in the activity log when they found something.
		if (actorUserId || reason === 'library-added') {
			queueDeviceEvent({
				type: 'scan.started',
				actorUserId,
				libraryId: target.id,
				detail: { reason }
			});
		}
	}
});

/**
 * Ask a library's device to (re)scan it: starts now, or after the device's
 * current scan (one per device at a time). `offline` = nothing was queued.
 */
export function requestScan(
	target: ScanTarget,
	reason: ScanReason,
	opts: { force?: boolean; actorUserId?: string | null } = {}
): ScanRequestOutcome {
	return coordinator.request({
		target: {
			id: target.id,
			gatewayId: target.gatewayId,
			rootPath: target.rootPath,
			kind: target.kind
		},
		reason,
		force: opts.force ?? false,
		actorUserId: opts.actorUserId ?? null
	});
}

/** Request a scan of every library on a device (it just reconnected, or the schedule is due). */
export async function requestGatewayScans(gatewayId: string, reason: ScanReason): Promise<void> {
	const libraries = await db.query.library.findMany({ where: eq(library.gatewayId, gatewayId) });
	for (const lib of libraries) requestScan(lib, reason);
}

/** `scan.done` arrived: the scan's bookkeeping (undefined = not started by this process). */
export function finishScan(libraryId: string): ActiveScan | undefined {
	return coordinator.finish(libraryId);
}

export function noteScanChanges(libraryId: string, files: number): void {
	if (files > 0) coordinator.noteChanged(libraryId, files);
}

export function abandonGatewayScans(gatewayId: string): void {
	coordinator.abandon(gatewayId);
}

export function forgetLibraryScans(libraryId: string): void {
	coordinator.forget(libraryId);
}

export function scanState(libraryId: string): 'scanning' | 'queued' | null {
	return coordinator.state(libraryId);
}

/** Another library may still be inserting titles; it prunes at its own end. */
export function hasActiveScans(): boolean {
	return coordinator.hasActive();
}
