import WebSocket from 'ws';
import {
	PROTOCOL_VERSION,
	createIdAllocator,
	parseHubMessage,
	type AgentCapabilities,
	type HubLimits,
	type HubMessage
} from '@finderella/protocol';

const AGENT_VERSION = '0.0.1';
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export interface ConnectionOptions {
	hubUrl: string;
	token: string;
	capabilities?: AgentCapabilities;
	log?: (message: string) => void;
	/** Handler for hub messages the connection itself doesn't consume. */
	onMessage?: (message: HubMessage, conn: AgentConnection) => void;
	/** Called when the socket drops (before any reconnect) — abort in-flight work here. */
	onDisconnect?: () => void;
}

/**
 * The agent's single outbound WebSocket to the hub: connects, authenticates
 * via bearer token on the upgrade request, sends `hello`, heartbeats with
 * `ping`/`pong`, and reconnects with capped exponential backoff (plus jitter)
 * forever. Later phases hang scan/transfer/transcode handling off `onMessage`.
 */
export class AgentConnection {
	#opts: ConnectionOptions;
	#log: (message: string) => void;
	#nextId = createIdAllocator('agent');
	#socket: WebSocket | null = null;
	#backoffMs = BACKOFF_MIN_MS;
	#heartbeatTimer: NodeJS.Timeout | null = null;
	#heartbeatDeadline: NodeJS.Timeout | null = null;
	#closed = false;
	#limits: HubLimits | null = null;
	#agentId: string | null = null;

	constructor(opts: ConnectionOptions) {
		this.#opts = opts;
		this.#log = opts.log ?? ((message) => console.log(message));
	}

	get agentId(): string | null {
		return this.#agentId;
	}

	get limits(): HubLimits | null {
		return this.#limits;
	}

	start(): void {
		this.#closed = false;
		this.#connect();
	}

	stop(): void {
		this.#closed = true;
		this.#clearHeartbeat();
		this.#socket?.close();
		this.#socket = null;
	}

	send(message: Record<string, unknown> & { type: string }): number {
		const id = 'id' in message && typeof message.id === 'number' ? message.id : this.#nextId();
		this.#socket?.send(JSON.stringify({ ...message, id }));
		return id;
	}

	sendBinary(frame: Uint8Array): void {
		this.#socket?.send(frame);
	}

	#wsUrl(): string {
		const url = new URL(this.#opts.hubUrl);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		url.pathname = '/agent/ws';
		url.search = '';
		return url.toString();
	}

	#connect(): void {
		if (this.#closed) return;
		const url = this.#wsUrl();
		this.#log(`connecting to ${url}`);
		const socket = new WebSocket(url, {
			headers: { authorization: `Bearer ${this.#opts.token}` }
		});
		this.#socket = socket;

		socket.on('open', () => {
			this.#backoffMs = BACKOFF_MIN_MS;
			this.send({
				type: 'hello',
				protocolVersion: PROTOCOL_VERSION,
				agentVersion: AGENT_VERSION,
				capabilities: this.#opts.capabilities ?? { ffmpeg: false, hwaccels: [] }
			});
		});

		socket.on('message', (data, isBinary) => {
			if (isBinary) return; // no hub→agent binary frames defined yet
			const parsed = parseHubMessage(data.toString());
			if (!parsed.ok) {
				this.#log(`ignoring unparseable hub message: ${parsed.error}`);
				return;
			}
			this.#handleMessage(parsed.message);
		});

		socket.on('close', (code, reason) => {
			this.#clearHeartbeat();
			this.#socket = null;
			this.#agentId = null;
			this.#opts.onDisconnect?.();
			if (this.#closed) return;
			const delay = this.#backoffMs + Math.floor(Math.random() * 1_000);
			this.#log(
				`disconnected (${code}${reason.length ? ` ${reason}` : ''}); retrying in ${delay}ms`
			);
			this.#backoffMs = Math.min(this.#backoffMs * 2, BACKOFF_MAX_MS);
			setTimeout(() => this.#connect(), delay);
		});

		socket.on('error', (err) => {
			this.#log(`socket error: ${err.message}`);
			// 'close' follows and drives the reconnect.
		});
	}

	#handleMessage(message: HubMessage): void {
		switch (message.type) {
			case 'welcome':
				this.#agentId = message.agentId;
				this.#limits = message.limits;
				this.#log(`connected as agent ${message.agentId}`);
				this.#startHeartbeat();
				break;
			case 'pong':
				if (this.#heartbeatDeadline) clearTimeout(this.#heartbeatDeadline);
				this.#heartbeatDeadline = null;
				break;
			default:
				this.#opts.onMessage?.(message, this);
		}
	}

	#startHeartbeat(): void {
		this.#clearHeartbeat();
		this.#heartbeatTimer = setInterval(() => {
			if (this.#socket?.readyState !== WebSocket.OPEN) return;
			this.send({ type: 'ping' });
			this.#heartbeatDeadline ??= setTimeout(() => {
				this.#log('heartbeat timed out; reconnecting');
				this.#socket?.terminate();
			}, HEARTBEAT_TIMEOUT_MS);
		}, HEARTBEAT_INTERVAL_MS);
	}

	#clearHeartbeat(): void {
		if (this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
		if (this.#heartbeatDeadline) clearTimeout(this.#heartbeatDeadline);
		this.#heartbeatTimer = null;
		this.#heartbeatDeadline = null;
	}
}
