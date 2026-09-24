import { count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { deviceEvent, gateway, library, user } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import type { DeviceEventEntry, DeviceEventType } from '$lib/data/device-events';

export const DEVICE_EVENTS_PAGE_SIZE = 20;

export interface DeviceEventInput {
	type: DeviceEventType;
	/** The admin who acted; omit for things the device or hub did on its own. */
	actorUserId?: string | null;
	gatewayId?: string | null;
	libraryId?: string | null;
	/** Snapshots; looked up from the ids when omitted (pass them when the row is about to go). */
	gatewayName?: string | null;
	libraryName?: string | null;
	detail?: Record<string, unknown>;
}

/**
 * Append to the Devices activity log. Best effort: a failed audit write is logged
 * and never fails the action it describes.
 */
export async function recordDeviceEvent(input: DeviceEventInput): Promise<void> {
	try {
		let { gatewayId = null, gatewayName = null, libraryName = null } = input;
		const libraryId = input.libraryId ?? null;
		if (libraryId && (libraryName === null || gatewayId === null || gatewayName === null)) {
			const [row] = await db
				.select({ name: library.name, gatewayId: gateway.id, gatewayName: gateway.name })
				.from(library)
				.innerJoin(gateway, eq(gateway.id, library.gatewayId))
				.where(eq(library.id, libraryId));
			libraryName ??= row?.name ?? null;
			gatewayId ??= row?.gatewayId ?? null;
			gatewayName ??= row?.gatewayName ?? null;
		}
		if (gatewayId && gatewayName === null) {
			const [row] = await db
				.select({ name: gateway.name })
				.from(gateway)
				.where(eq(gateway.id, gatewayId));
			gatewayName = row?.name ?? null;
		}
		let actorName: string | null = null;
		if (input.actorUserId) {
			const [row] = await db
				.select({ name: user.name })
				.from(user)
				.where(eq(user.id, input.actorUserId));
			actorName = row?.name ?? null;
		}
		await db.insert(deviceEvent).values({
			type: input.type,
			actorUserId: input.actorUserId ?? null,
			actorName,
			gatewayId,
			gatewayName,
			libraryId,
			libraryName,
			detail: input.detail ?? null
		});
	} catch (err) {
		log.error({ err, type: input.type }, 'failed to record device event');
	}
}

/** Fire-and-forget form for code paths that must not wait on the audit write. */
export function queueDeviceEvent(input: DeviceEventInput): void {
	void recordDeviceEvent(input);
}

export async function listDeviceEvents(requestedPage = 1): Promise<{
	entries: DeviceEventEntry[];
	total: number;
	page: number;
	perPage: number;
}> {
	const [{ total }] = await db.select({ total: count() }).from(deviceEvent);
	const pages = Math.max(1, Math.ceil(total / DEVICE_EVENTS_PAGE_SIZE));
	const page = Math.min(Math.max(1, requestedPage), pages);
	const rows = await db
		.select()
		.from(deviceEvent)
		.orderBy(desc(deviceEvent.createdAt))
		.limit(DEVICE_EVENTS_PAGE_SIZE)
		.offset((page - 1) * DEVICE_EVENTS_PAGE_SIZE);
	return {
		entries: rows.map((row) => ({
			id: row.id,
			type: row.type,
			at: row.createdAt.toISOString(),
			actorName: row.actorName,
			gatewayName: row.gatewayName,
			libraryName: row.libraryName,
			detail: row.detail ?? {}
		})),
		total,
		page,
		perPage: DEVICE_EVENTS_PAGE_SIZE
	};
}
