import { randomInt } from 'node:crypto';
import { count, desc, eq, gt, isNull, and } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { gateway, gatewayPairingCode, library, mediaFile } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { triggerScan } from '$lib/server/gateways/scan';
import { countOrphans, pruneCatalog } from '$lib/server/catalog/prune';
import { enrichPending, isTmdbConfigured, metadataStatus } from '$lib/server/metadata';
import { LibraryKind } from '@finderella/protocol';
import type { Actions, PageServerLoad } from './$types';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
// No confusable characters (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
	return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export const load: PageServerLoad = async () => {
	const [gateways, fileCounts, pendingCodes, orphans, metadata] = await Promise.all([
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
		countOrphans(),
		metadataStatus()
	]);
	const counts = new Map(fileCounts.map((row) => [row.libraryId, row.files]));
	return {
		gateways: gateways.map((a) => ({
			id: a.id,
			name: a.name,
			online: registry.isOnline(a.id),
			gatewayVersion: a.gatewayVersion,
			ffmpeg: a.capabilities?.ffmpeg ?? false,
			lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
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
		orphans,
		metadata
	};
};

export const actions: Actions = {
	createCode: async (event) => {
		const formData = await event.request.formData();
		const gatewayName = formData.get('name')?.toString().trim() || 'New device';
		const code = generateCode();
		await db.insert(gatewayPairingCode).values({
			code,
			gatewayName,
			createdByUserId: event.locals.user!.id,
			expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS)
		});
		return { code };
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
		try {
			triggerScan(lib);
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
		return { rescanned: lib.id };
	},

	renameGateway: async (event) => {
		const formData = await event.request.formData();
		const gatewayId = formData.get('gatewayId')?.toString() ?? '';
		const name = formData.get('name')?.toString().trim() ?? '';
		if (!gatewayId || !name) return fail(400, { message: 'Name is required' });
		await db.update(gateway).set({ name }).where(eq(gateway.id, gatewayId));
		return { renamed: gatewayId };
	},

	revokeGateway: async (event) => {
		const formData = await event.request.formData();
		const gatewayId = formData.get('gatewayId')?.toString() ?? '';
		if (!gatewayId) return fail(400, { message: 'Missing gateway' });
		// Close the live connection first so the gateway can't keep serving.
		const connected = registry.get(gatewayId);
		connected?.socket.close(4003, 'revoked');
		// Cascades libraries and media files; catalog entries remain until the
		// next prune (end of any scan, or "Remove titles without files").
		await db.delete(gateway).where(eq(gateway.id, gatewayId));
		return { revoked: gatewayId };
	},

	removeLibrary: async (event) => {
		const formData = await event.request.formData();
		const libraryId = formData.get('libraryId')?.toString() ?? '';
		if (!libraryId) return fail(400, { message: 'Missing library' });
		await db.delete(library).where(eq(library.id, libraryId));
		return { removedLibrary: libraryId };
	},

	pruneCatalog: async () => {
		const pruned = await pruneCatalog();
		return { pruned };
	},

	refreshMetadata: async () => {
		if (!isTmdbConfigured()) return fail(400, { message: 'TMDB_API_KEY is not set on the hub' });
		// Runs in the background; the page shows progress via the pending counts.
		void enrichPending({ force: true });
		return { refreshing: true };
	},

	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		redirect(302, '/login');
	}
};
