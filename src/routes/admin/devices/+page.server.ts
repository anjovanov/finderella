import { randomInt } from 'node:crypto';
import { count, desc, eq, gt, isNull, and } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gateway, gatewayPairingCode, library, mediaFile } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { listDeviceEvents, recordDeviceEvent } from '$lib/server/gateways/events';
import { triggerScan } from '$lib/server/gateways/scan';
import { getSiteSettings } from '$lib/server/site-settings';
import {
	startTrickplayBulk,
	stopTrickplayBulk,
	trickplayBulkStatus
} from '$lib/server/trickplay/bulk';
import { LibraryKind } from '@finderella/protocol';
import type { Actions, PageServerLoad } from './$types';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
// No confusable characters (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
	return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export const load: PageServerLoad = async ({ url }) => {
	const logPage = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 1));
	const [gateways, fileCounts, pendingCodes, siteSettings, events] = await Promise.all([
		db.query.gateway.findMany({
			with: { libraries: true },
			orderBy: [desc(gateway.createdAt)]
		}),
		db
			.select({ libraryId: mediaFile.libraryId, files: count() })
			.from(mediaFile)
			.where(eq(mediaFile.status, 'active'))
			.groupBy(mediaFile.libraryId),
		db.query.gatewayPairingCode.findMany({
			where: and(
				isNull(gatewayPairingCode.claimedByGatewayId),
				gt(gatewayPairingCode.expiresAt, new Date())
			)
		}),
		getSiteSettings(),
		listDeviceEvents(logPage)
	]);
	const counts = new Map(fileCounts.map((row) => [row.libraryId, row.files]));
	return {
		gateways: gateways.map((a) => ({
			id: a.id,
			name: a.name,
			online: registry.isOnline(a.id),
			gatewayVersion: a.gatewayVersion,
			trickplay: a.capabilities?.trickplay ?? false,
			lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
			createdAt: a.createdAt.toISOString(),
			libraries: a.libraries.map((lib) => ({
				id: lib.id,
				name: lib.name,
				rootPath: lib.rootPath,
				kind: lib.kind,
				lastScanAt: lib.lastScanAt?.toISOString() ?? null,
				files: counts.get(lib.id) ?? 0
			}))
		})),
		pendingCodes: pendingCodes.map((c) => ({
			code: c.code,
			gatewayName: c.gatewayName,
			expiresAt: c.expiresAt.toISOString()
		})),
		trickplayJob: trickplayBulkStatus(),
		trickplayEnabled: siteSettings.trickplayEnabled,
		events
	};
};

export const actions: Actions = {
	createCode: async (event) => {
		const formData = await event.request.formData();
		const gatewayName = formData.get('name')?.toString().trim() || 'New device';
		const code = generateCode();
		const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
		await db.insert(gatewayPairingCode).values({
			code,
			gatewayName,
			createdByUserId: event.locals.user!.id,
			expiresAt
		});
		return { code, gatewayName, expiresAt: expiresAt.toISOString() };
	},

	addLibrary: async (event) => {
		const formData = await event.request.formData();
		const gatewayId = formData.get('gatewayId')?.toString() ?? '';
		const rootPath = formData.get('rootPath')?.toString().trim() ?? '';
		const kindRaw = formData.get('kind')?.toString() ?? '';
		const name = formData.get('name')?.toString().trim() || rootPath.split('/').at(-1) || rootPath;
		const kind = LibraryKind.safeParse(kindRaw);
		if (!gatewayId || !rootPath || !kind.success) {
			return fail(400, { message: 'Gateway, folder path, and kind are required' });
		}
		const [lib] = await db
			.insert(library)
			.values({ gatewayId, rootPath, name, kind: kind.data })
			.onConflictDoNothing({ target: [library.gatewayId, library.rootPath] })
			.returning();
		if (!lib) return fail(409, { message: 'That folder is already a library on this device' });
		const actorUserId = event.locals.user!.id;
		await recordDeviceEvent({
			type: 'library.added',
			actorUserId,
			libraryId: lib.id,
			detail: { rootPath: lib.rootPath, kind: lib.kind }
		});
		try {
			triggerScan(lib);
			await recordDeviceEvent({
				type: 'scan.started',
				actorUserId,
				libraryId: lib.id,
				detail: { reason: 'library-added' }
			});
		} catch {
			// Offline: the library is saved; scan can be triggered when it connects.
		}
		return { added: lib.id };
	},

	rescan: async (event) => {
		const formData = await event.request.formData();
		const libraryId = formData.get('libraryId')?.toString() ?? '';
		const lib = await db.query.library.findFirst({ where: eq(library.id, libraryId) });
		if (!lib) return fail(404, { message: 'Library not found' });
		try {
			triggerScan(lib);
		} catch {
			return fail(409, { message: 'Device is offline' });
		}
		await recordDeviceEvent({
			type: 'scan.started',
			actorUserId: event.locals.user!.id,
			libraryId: lib.id,
			detail: { reason: 'rescan' }
		});
		return { rescanned: lib.id };
	},

	generateTrickplay: async (event) => {
		const formData = await event.request.formData();
		const libraryId = formData.get('libraryId')?.toString() ?? '';
		if (!libraryId) return fail(400, { message: 'Missing library' });
		const outcome = await startTrickplayBulk(libraryId);
		switch (outcome) {
			case 'started':
				await recordDeviceEvent({
					type: 'thumbnails.started',
					actorUserId: event.locals.user!.id,
					libraryId
				});
				return { trickplayStarted: libraryId };
			case 'busy':
				return fail(409, { message: 'A thumbnail job is already running' });
			case 'disabled':
				return fail(409, { message: 'Thumbnails are turned off in Site settings' });
			case 'offline':
				return fail(409, { message: 'Device is offline' });
			case 'unsupported':
				return fail(501, { message: 'Update the gateway on this device to generate thumbnails' });
			case 'not-found':
				return fail(404, { message: 'Library not found' });
		}
	},

	stopTrickplay: async () => {
		stopTrickplayBulk();
		return { trickplayStopped: true };
	},

	renameGateway: async (event) => {
		const formData = await event.request.formData();
		const gatewayId = formData.get('gatewayId')?.toString() ?? '';
		const name = formData.get('name')?.toString().trim() ?? '';
		if (!gatewayId || !name) return fail(400, { message: 'Name is required' });
		const before = await db.query.gateway.findFirst({
			columns: { name: true },
			where: eq(gateway.id, gatewayId)
		});
		if (!before) return fail(404, { message: 'Device not found' });
		await db.update(gateway).set({ name }).where(eq(gateway.id, gatewayId));
		if (before.name !== name) {
			await recordDeviceEvent({
				type: 'device.renamed',
				actorUserId: event.locals.user!.id,
				gatewayId,
				gatewayName: name,
				detail: { from: before.name, to: name }
			});
		}
		return { renamed: gatewayId };
	},

	revokeGateway: async (event) => {
		const formData = await event.request.formData();
		const gatewayId = formData.get('gatewayId')?.toString() ?? '';
		if (!gatewayId) return fail(400, { message: 'Missing gateway' });
		const target = await db.query.gateway.findFirst({
			columns: { name: true },
			with: { libraries: { columns: { id: true } } },
			where: eq(gateway.id, gatewayId)
		});
		if (!target) return fail(404, { message: 'Device not found' });
		// Close the live connection first so the gateway can't keep serving.
		const connected = registry.get(gatewayId);
		connected?.socket.close(4003, 'revoked');
		// Cascades libraries and media files; catalog entries remain until the
		// next prune (end of any scan, or "Remove titles without files").
		// The code it paired with would otherwise lose its claim (the FK sets null) and pair
		// again until it expires.
		await db.delete(gatewayPairingCode).where(eq(gatewayPairingCode.claimedByGatewayId, gatewayId));
		await db.delete(gateway).where(eq(gateway.id, gatewayId));
		// Logged after the delete with the name only — the row is gone.
		await recordDeviceEvent({
			type: 'device.revoked',
			actorUserId: event.locals.user!.id,
			gatewayName: target.name,
			detail: { libraries: target.libraries.length }
		});
		return { revoked: gatewayId };
	},

	removeLibrary: async (event) => {
		const formData = await event.request.formData();
		const libraryId = formData.get('libraryId')?.toString() ?? '';
		if (!libraryId) return fail(400, { message: 'Missing library' });
		const lib = await db.query.library.findFirst({
			columns: { name: true, gatewayId: true },
			where: eq(library.id, libraryId)
		});
		if (!lib) return fail(404, { message: 'Library not found' });
		const [{ files }] = await db
			.select({ files: count() })
			.from(mediaFile)
			.where(and(eq(mediaFile.libraryId, libraryId), eq(mediaFile.status, 'active')));
		await db.delete(library).where(eq(library.id, libraryId));
		await recordDeviceEvent({
			type: 'library.removed',
			actorUserId: event.locals.user!.id,
			gatewayId: lib.gatewayId,
			libraryName: lib.name,
			detail: { files }
		});
		return { removedLibrary: libraryId };
	}
};
