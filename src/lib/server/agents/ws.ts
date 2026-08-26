import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { eq } from 'drizzle-orm';
import { WebSocketServer, type WebSocket } from 'ws';
import {
	DEFAULT_LIMITS,
	PROTOCOL_VERSION,
	parseAgentMessage,
	type AgentMessage
} from '@finderella/protocol';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { agent } from '$lib/server/db/schema';
import { finalizeScan, ingestScanBatch } from '$lib/server/catalog/ingest';
import { log } from '$lib/server/log';
import { registry, type ConnectedAgent } from './registry';

const wss = new WebSocketServer({ noServer: true });

type AgentRow = typeof agent.$inferSelect;

/**
 * Authenticate and accept an agent WebSocket at /agent/ws. Called from the
 * dev-server Vite plugin and, in production, from server/index.js via the
 * `init` hook bridge (see src/hooks.server.ts).
 *
 * Auth: per-agent bearer token minted by the pairing flow, matched by sha256
 * hash. In dev, AGENT_DEV_TOKEN is also accepted and lazily creates a
 * "Dev Agent" row so the rest of the pipeline behaves identically.
 */
export async function handleUpgrade(
	req: IncomingMessage,
	socket: Duplex,
	head: Buffer
): Promise<void> {
	try {
		const row = await authenticate(bearerToken(req.headers.authorization));
		if (!row) {
			log.warn('rejected agent upgrade: bad or missing token');
			socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, row));
	} catch (err) {
		log.error({ err }, 'agent upgrade failed');
		socket.destroy();
	}
}

function bearerToken(header: string | undefined): string | null {
	if (!header?.startsWith('Bearer ')) return null;
	return header.slice('Bearer '.length).trim() || null;
}

async function authenticate(token: string | null): Promise<AgentRow | null> {
	if (!token) return null;
	const tokenHash = createHash('sha256').update(token).digest('hex');
	const row = await db.query.agent.findFirst({ where: eq(agent.tokenHash, tokenHash) });
	if (row) return row;

	// Dev convenience: a shared token that self-registers a real agent row.
	if (dev && env.AGENT_DEV_TOKEN && token === env.AGENT_DEV_TOKEN) {
		const anyUser = await db.query.user.findFirst({ columns: { id: true } });
		if (!anyUser) {
			log.warn('AGENT_DEV_TOKEN used but no user exists yet — sign up first');
			return null;
		}
		const [created] = await db
			.insert(agent)
			.values({ name: 'Dev Agent', tokenHash, pairedByUserId: anyUser.id })
			.onConflictDoNothing({ target: agent.tokenHash })
			.returning();
		return (
			created ?? (await db.query.agent.findFirst({ where: eq(agent.tokenHash, tokenHash) })) ?? null
		);
	}
	return null;
}

function onConnection(ws: WebSocket, row: AgentRow): void {
	const agentId = row.id;
	let registered: ConnectedAgent | null = null;

	ws.on('message', (data, isBinary) => {
		if (isBinary) {
			if (!registered) return;
			const buf = Array.isArray(data)
				? Buffer.concat(data)
				: data instanceof ArrayBuffer
					? new Uint8Array(data)
					: data;
			registry.handleBinaryFrame(
				registered,
				new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
			);
			return;
		}
		const parsed = parseAgentMessage(data.toString());
		if (!parsed.ok) {
			log.warn({ agentId, error: parsed.error }, 'unparseable agent message');
			return;
		}
		registered = handleMessage(ws, row, registered, parsed.message);
	});

	ws.on('close', () => {
		if (registered) registry.unregister(agentId, ws);
	});

	ws.on('error', (err) => {
		log.warn({ agentId, err }, 'agent socket error');
	});
}

function handleMessage(
	ws: WebSocket,
	row: AgentRow,
	registered: ConnectedAgent | null,
	message: AgentMessage
): ConnectedAgent | null {
	switch (message.type) {
		case 'hello': {
			if (message.protocolVersion !== PROTOCOL_VERSION) {
				log.warn(
					{ agentId: row.id, theirs: message.protocolVersion, ours: PROTOCOL_VERSION },
					'protocol version mismatch; closing'
				);
				ws.close(4001, 'protocol version mismatch');
				return registered;
			}
			const connected = registry.register({
				agentId: row.id,
				socket: ws,
				agentVersion: message.agentVersion,
				capabilities: message.capabilities
			});
			void db
				.update(agent)
				.set({
					agentVersion: message.agentVersion,
					capabilities: message.capabilities,
					lastSeenAt: new Date()
				})
				.where(eq(agent.id, row.id))
				.catch((err) => log.error({ err }, 'failed to persist agent hello'));
			ws.send(
				JSON.stringify({
					id: connected.nextId(),
					type: 'welcome',
					protocolVersion: PROTOCOL_VERSION,
					agentId: row.id,
					limits: DEFAULT_LIMITS
				})
			);
			return connected;
		}
		case 'ping':
			registry.touch(row.id);
			void db
				.update(agent)
				.set({ lastSeenAt: new Date() })
				.where(eq(agent.id, row.id))
				.catch((err) => log.error({ err }, 'failed to persist agent heartbeat'));
			ws.send(JSON.stringify({ id: registered?.nextId() ?? 1, type: 'pong', re: message.id }));
			return registered;
		case 'resp':
			if (registered) registry.handleResp(registered, message);
			return registered;
		case 'scan.file':
			void ingestScanBatch(message.libraryId, message.files).catch((err) =>
				log.error({ err, libraryId: message.libraryId }, 'scan batch ingest failed')
			);
			return registered;
		case 'scan.done':
			void finalizeScan(message.libraryId, message.stats).catch((err) =>
				log.error({ err, libraryId: message.libraryId }, 'scan finalize failed')
			);
			return registered;
	}
}
