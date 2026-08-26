import { randomInt } from 'node:crypto';
import { count, desc, eq, gt, isNull, and } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { agent, agentPairingCode, library, mediaFile } from '$lib/server/db/schema';
import { registry } from '$lib/server/agents/registry';
import { triggerScan } from '$lib/server/agents/scan';
import { LibraryKind } from '@finderella/protocol';
import type { Actions, PageServerLoad } from './$types';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
// No confusable characters (0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
	return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export const load: PageServerLoad = async () => {
	const [agents, fileCounts, pendingCodes] = await Promise.all([
		db.query.agent.findMany({
			with: { libraries: true },
			orderBy: [desc(agent.createdAt)]
		}),
		db
			.select({ libraryId: mediaFile.libraryId, files: count() })
			.from(mediaFile)
			.where(eq(mediaFile.status, 'active'))
			.groupBy(mediaFile.libraryId),
		db.query.agentPairingCode.findMany({
			where: and(
				isNull(agentPairingCode.claimedByAgentId),
				gt(agentPairingCode.expiresAt, new Date())
			)
		})
	]);
	const counts = new Map(fileCounts.map((row) => [row.libraryId, row.files]));
	return {
		agents: agents.map((a) => ({
			id: a.id,
			name: a.name,
			online: registry.isOnline(a.id),
			agentVersion: a.agentVersion,
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
			agentName: c.agentName,
			expiresAt: c.expiresAt.toISOString()
		}))
	};
};

export const actions: Actions = {
	createCode: async (event) => {
		const formData = await event.request.formData();
		const agentName = formData.get('name')?.toString().trim() || 'New device';
		const code = generateCode();
		await db.insert(agentPairingCode).values({
			code,
			agentName,
			createdByUserId: event.locals.user!.id,
			expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS)
		});
		return { code };
	},

	addLibrary: async (event) => {
		const formData = await event.request.formData();
		const agentId = formData.get('agentId')?.toString() ?? '';
		const rootPath = formData.get('rootPath')?.toString().trim() ?? '';
		const kindRaw = formData.get('kind')?.toString() ?? '';
		const name = formData.get('name')?.toString().trim() || rootPath.split('/').at(-1) || rootPath;
		const kind = LibraryKind.safeParse(kindRaw);
		if (!agentId || !rootPath || !kind.success) {
			return fail(400, { message: 'Agent, folder path, and kind are required' });
		}
		const [lib] = await db
			.insert(library)
			.values({ agentId, rootPath, name, kind: kind.data })
			.onConflictDoNothing({ target: [library.agentId, library.rootPath] })
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

	renameAgent: async (event) => {
		const formData = await event.request.formData();
		const agentId = formData.get('agentId')?.toString() ?? '';
		const name = formData.get('name')?.toString().trim() ?? '';
		if (!agentId || !name) return fail(400, { message: 'Name is required' });
		await db.update(agent).set({ name }).where(eq(agent.id, agentId));
		return { renamed: agentId };
	},

	revokeAgent: async (event) => {
		const formData = await event.request.formData();
		const agentId = formData.get('agentId')?.toString() ?? '';
		if (!agentId) return fail(400, { message: 'Missing agent' });
		// Close the live connection first so the agent can't keep serving.
		const connected = registry.get(agentId);
		connected?.socket.close(4003, 'revoked');
		// Cascades libraries and media files; catalog entries remain.
		await db.delete(agent).where(eq(agent.id, agentId));
		return { revoked: agentId };
	},

	removeLibrary: async (event) => {
		const formData = await event.request.formData();
		const libraryId = formData.get('libraryId')?.toString() ?? '';
		if (!libraryId) return fail(400, { message: 'Missing library' });
		await db.delete(library).where(eq(library.id, libraryId));
		return { removedLibrary: libraryId };
	},

	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		redirect(302, '/login');
	}
};
