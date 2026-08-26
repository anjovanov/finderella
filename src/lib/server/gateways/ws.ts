import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { eq } from 'drizzle-orm';
import { WebSocketServer, type WebSocket } from 'ws';
import {
	DEFAULT_LIMITS,
	PROTOCOL_VERSION,
	parseGatewayMessage,
	type GatewayMessage
} from '@finderella/protocol';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { gateway } from '$lib/server/db/schema';
import { finalizeScan, ingestScanBatch } from '$lib/server/catalog/ingest';
import { log } from '$lib/server/log';
import { registry, type ConnectedGateway } from './registry';

const wss = new WebSocketServer({ noServer: true });

type GatewayRow = typeof gateway.$inferSelect;

/**
 * Authenticate and accept an gateway WebSocket at /gateway/ws. Called from the
 * dev-server Vite plugin and, in production, from server/index.js via the
 * `init` hook bridge (see src/hooks.server.ts).
 *
 * Auth: per-gateway bearer token minted by the pairing flow, matched by sha256
 * hash. In dev, GATEWAY_DEV_TOKEN is also accepted and lazily creates a
 * "Dev Gateway" row so the rest of the pipeline behaves identically.
 */
export async function handleUpgrade(
	req: IncomingMessage,
	socket: Duplex,
	head: Buffer
): Promise<void> {
	try {
		const row = await authenticate(bearerToken(req.headers.authorization));
		if (!row) {
			log.warn('rejected gateway upgrade: bad or missing token');
			socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, row));
	} catch (err) {
		log.error({ err }, 'gateway upgrade failed');
		socket.destroy();
	}
}

function bearerToken(header: string | undefined): string | null {
	if (!header?.startsWith('Bearer ')) return null;
	return header.slice('Bearer '.length).trim() || null;
}

async function authenticate(token: string | null): Promise<GatewayRow | null> {
	if (!token) return null;
	const tokenHash = createHash('sha256').update(token).digest('hex');
	const row = await db.query.gateway.findFirst({ where: eq(gateway.tokenHash, tokenHash) });
	if (row) return row;

	// Dev convenience: a shared token that self-registers a real gateway row.
	if (dev && env.GATEWAY_DEV_TOKEN && token === env.GATEWAY_DEV_TOKEN) {
		const anyUser = await db.query.user.findFirst({ columns: { id: true } });
		if (!anyUser) {
			log.warn('GATEWAY_DEV_TOKEN used but no user exists yet — sign up first');
			return null;
		}
		const [created] = await db
			.insert(gateway)
			.values({ name: 'Dev Gateway', tokenHash, pairedByUserId: anyUser.id })
			.onConflictDoNothing({ target: gateway.tokenHash })
			.returning();
		return (
			created ??
			(await db.query.gateway.findFirst({ where: eq(gateway.tokenHash, tokenHash) })) ??
			null
		);
	}
	return null;
}

function onConnection(ws: WebSocket, row: GatewayRow): void {
	const gatewayId = row.id;
	let registered: ConnectedGateway | null = null;

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
		const parsed = parseGatewayMessage(data.toString());
		if (!parsed.ok) {
			log.warn({ gatewayId, error: parsed.error }, 'unparseable gateway message');
			return;
		}
		registered = handleMessage(ws, row, registered, parsed.message);
	});

	ws.on('close', () => {
		if (registered) registry.unregister(gatewayId, ws);
	});

	ws.on('error', (err) => {
		log.warn({ gatewayId, err }, 'gateway socket error');
	});
}

function handleMessage(
	ws: WebSocket,
	row: GatewayRow,
	registered: ConnectedGateway | null,
	message: GatewayMessage
): ConnectedGateway | null {
	switch (message.type) {
		case 'hello': {
			if (message.protocolVersion !== PROTOCOL_VERSION) {
				log.warn(
					{ gatewayId: row.id, theirs: message.protocolVersion, ours: PROTOCOL_VERSION },
					'protocol version mismatch; closing'
				);
				ws.close(4001, 'protocol version mismatch');
				return registered;
			}
			const connected = registry.register({
				gatewayId: row.id,
				socket: ws,
				gatewayVersion: message.gatewayVersion,
				capabilities: message.capabilities
			});
			void db
				.update(gateway)
				.set({
					gatewayVersion: message.gatewayVersion,
					capabilities: message.capabilities,
					lastSeenAt: new Date()
				})
				.where(eq(gateway.id, row.id))
				.catch((err) => log.error({ err }, 'failed to persist gateway hello'));
			ws.send(
				JSON.stringify({
					id: connected.nextId(),
					type: 'welcome',
					protocolVersion: PROTOCOL_VERSION,
					gatewayId: row.id,
					limits: DEFAULT_LIMITS
				})
			);
			return connected;
		}
		case 'ping':
			registry.touch(row.id);
			void db
				.update(gateway)
				.set({ lastSeenAt: new Date() })
				.where(eq(gateway.id, row.id))
				.catch((err) => log.error({ err }, 'failed to persist gateway heartbeat'));
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
