import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { env } from '$env/dynamic/private';
import { TOGETHER_CLOSE, type TogetherServerMessage } from '$lib/data/together';
import { log } from '$lib/server/log';
import { parseClientMessage } from './messages';
import type { Connection } from './room';
import { togetherRooms } from './rooms';
import { consumeTicket, type Ticket } from './tickets';

/** Chat lines and intents are tiny; anything bigger is not ours. */
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
/** Below nginx's 60 s / Cloudflare's 100 s idle cuts; also how dead peers are found. */
const PING_INTERVAL_MS = 25_000;

/**
 * Accept a watch-party socket at /ws/together. Called from the dev-server Vite
 * plugin and, in production, from server/index.js via the `init` hook bridge
 * (see src/hooks.server.ts). Never reaches SvelteKit's `handle`: auth is the
 * single-use ticket from POST /api/together/[code]/ticket.
 */
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
	try {
		if (!originAllowed(req)) {
			log.warn({ origin: req.headers.origin }, 'rejected watch-party upgrade: foreign origin');
			refuse(socket, '403 Forbidden');
			return;
		}
		const url = new URL(req.url ?? '/', 'http://localhost');
		const ticket = consumeTicket(url.searchParams.get('ticket'));
		if (!ticket) {
			refuse(socket, '401 Unauthorized');
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ticket));
	} catch (err) {
		log.error({ err }, 'watch-party upgrade failed');
		socket.destroy();
	}
}

function refuse(socket: Duplex, status: string): void {
	socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
	socket.destroy();
}

/**
 * Cross-site WebSocket hijacking guard: browsers always send Origin on a WS
 * handshake. Accept the configured ORIGIN, or the same host the request was
 * addressed to (dev server, reverse proxies that keep Host).
 */
function originAllowed(req: IncomingMessage): boolean {
	const origin = req.headers.origin;
	if (!origin) return false;
	let parsed: URL;
	try {
		parsed = new URL(origin);
	} catch {
		return false;
	}
	if (env.ORIGIN) {
		try {
			if (parsed.origin === new URL(env.ORIGIN).origin) return true;
		} catch {
			// malformed ORIGIN: fall through to the Host comparison
		}
	}
	return !!req.headers.host && parsed.host === req.headers.host;
}

function onConnection(ws: WebSocket, ticket: Ticket): void {
	const room = togetherRooms.get(ticket.code);
	const connection: Connection = {
		send(message: TogetherServerMessage) {
			if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
		},
		close(code, reason) {
			ws.close(code, reason.slice(0, 120));
		}
	};
	if (!room) {
		connection.send({ type: 'ended', reason: 'gone', message: 'This watch party has ended.' });
		ws.close(TOGETHER_CLOSE.gone, 'ended');
		return;
	}
	const joined = room.join(ticket.identity, connection, ticket.resumeId);
	if (!joined.ok) {
		const message =
			joined.reason === 'full'
				? 'This watch party is full.'
				: joined.reason === 'kicked'
					? 'You were removed from this watch party.'
					: 'This watch party has ended.';
		connection.send({
			type: 'ended',
			reason: joined.reason === 'kicked' ? 'kicked' : 'gone',
			message
		});
		ws.close(joined.reason === 'full' ? TOGETHER_CLOSE.full : TOGETHER_CLOSE.gone, 'refused');
		return;
	}
	const participantId = joined.participantId;

	let alive = true;
	ws.on('pong', () => (alive = true));
	const pinger = setInterval(() => {
		if (!alive) {
			ws.terminate();
			return;
		}
		alive = false;
		ws.ping();
	}, PING_INTERVAL_MS);

	ws.on('message', (data, isBinary) => {
		if (isBinary) return;
		const message = parseClientMessage(data.toString());
		if (!message) {
			log.debug({ code: room.code }, 'unparseable watch-party message');
			return;
		}
		room.handle(participantId, message);
	});

	// 1000 = the page closed it on purpose (Leave, Back); anything else (1001 on
	// reload/tab close, 1006 on a dropped network) keeps the seat for a while.
	ws.on('close', (code) => {
		clearInterval(pinger);
		if (code === 1000) room.leave(participantId, connection);
		else room.disconnect(participantId, connection);
	});

	ws.on('error', (err) => {
		log.debug({ err, code: room.code }, 'watch-party socket error');
	});
}
