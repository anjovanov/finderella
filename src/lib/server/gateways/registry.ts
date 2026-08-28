import type { WebSocket } from 'ws';
import {
	createIdAllocator,
	decodeBinaryFrame,
	DEFAULT_LIMITS,
	type GatewayCapabilities,
	type RespMessage
} from '@finderella/protocol';
import { log } from '$lib/server/log';

interface PendingRequest {
	resolve: (data: unknown) => void;
	reject: (err: Error) => void;
	timer: NodeJS.Timeout | null;
	/** Present for byte-stream requests: routes binary frames. */
	onChunk?: (payload: Uint8Array, fin: boolean) => void;
}

export interface ConnectedGateway {
	gatewayId: string;
	socket: WebSocket;
	nextId: () => number;
	pending: Map<number, PendingRequest>;
	connectedAt: Date;
	lastSeenAt: Date;
	gatewayVersion: string;
	capabilities: GatewayCapabilities;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * In-memory map of live gateway connections plus hub→gateway request correlation.
 * Single-process by design (one VPS): if the hub is ever scaled out, this —
 * and SessionManager — are what need a shared backing store.
 */
class GatewayRegistry {
	#gateways = new Map<string, ConnectedGateway>();

	register(input: {
		gatewayId: string;
		socket: WebSocket;
		gatewayVersion: string;
		capabilities: GatewayCapabilities;
	}): ConnectedGateway {
		const existing = this.#gateways.get(input.gatewayId);
		if (existing) {
			log.warn({ gatewayId: input.gatewayId }, 'gateway reconnected; closing previous socket');
			this.#failAllPending(existing, new Error('superseded by a new connection'));
			existing.socket.close(4000, 'superseded');
		}
		const gateway: ConnectedGateway = {
			...input,
			nextId: createIdAllocator('hub'),
			pending: new Map(),
			connectedAt: new Date(),
			lastSeenAt: new Date()
		};
		this.#gateways.set(input.gatewayId, gateway);
		log.info(
			{ gatewayId: input.gatewayId, gatewayVersion: input.gatewayVersion },
			'gateway connected'
		);
		return gateway;
	}

	unregister(gatewayId: string, socket: WebSocket): void {
		const gateway = this.#gateways.get(gatewayId);
		if (!gateway || gateway.socket !== socket) return; // stale close from a superseded socket
		this.#failAllPending(gateway, new Error('gateway disconnected'));
		this.#gateways.delete(gatewayId);
		log.info({ gatewayId }, 'gateway disconnected');
	}

	get(gatewayId: string): ConnectedGateway | undefined {
		return this.#gateways.get(gatewayId);
	}

	list(): ConnectedGateway[] {
		return [...this.#gateways.values()];
	}

	isOnline(gatewayId: string): boolean {
		return this.#gateways.has(gatewayId);
	}

	touch(gatewayId: string): void {
		const gateway = this.#gateways.get(gatewayId);
		if (gateway) gateway.lastSeenAt = new Date();
	}

	/** Fire-and-forget message to an gateway. Throws if the gateway is offline. */
	send(gatewayId: string, message: Record<string, unknown> & { type: string }): void {
		const gateway = this.#gateways.get(gatewayId);
		if (!gateway) throw new Error(`gateway ${gatewayId} is offline`);
		gateway.socket.send(JSON.stringify({ ...message, id: gateway.nextId() }));
	}

	/** Send a request down the tunnel and await the gateway's `resp`. */
	request(
		gatewayId: string,
		message: Record<string, unknown> & { type: string },
		opts: { timeoutMs?: number } = {}
	): Promise<unknown> {
		const gateway = this.#gateways.get(gatewayId);
		if (!gateway) return Promise.reject(new Error(`gateway ${gatewayId} is offline`));
		const id = gateway.nextId();
		const timeoutMs = opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				gateway.pending.delete(id);
				reject(new Error(`request ${message.type} to gateway ${gatewayId} timed out`));
			}, timeoutMs);
			gateway.pending.set(id, { resolve, reject, timer });
			gateway.socket.send(JSON.stringify({ ...message, id }));
		});
	}

	handleResp(gateway: ConnectedGateway, resp: RespMessage): void {
		const pending = gateway.pending.get(resp.re);
		if (!pending) return; // late response after timeout/cancel/FIN
		gateway.pending.delete(resp.re);
		if (pending.timer) clearTimeout(pending.timer);
		if (resp.ok) {
			pending.resolve(resp.data);
			return;
		}
		const error = resp.error ?? 'gateway request failed';
		// Byte-stream failures (hls.get / file.read) otherwise surface only as
		// a truncated response body; keep the gateway's reason in the hub log.
		if (pending.onChunk) {
			log.warn(
				{ gatewayId: gateway.gatewayId, requestId: resp.re, error },
				'gateway request failed'
			);
		}
		pending.reject(new Error(error));
	}

	handleBinaryFrame(gateway: ConnectedGateway, data: Uint8Array): void {
		let frame;
		try {
			frame = decodeBinaryFrame(data);
		} catch (err) {
			log.warn({ gatewayId: gateway.gatewayId, err }, 'undecodable binary frame');
			return;
		}
		const pending = gateway.pending.get(frame.requestId);
		pending?.onChunk?.(frame.payload, frame.fin);
	}

	/**
	 * Open a hub→gateway byte stream (file range, HLS segment). Returns a web
	 * ReadableStream whose pull() replenishes the gateway's credit window, so a
	 * slow browser applies backpressure all the way to the gateway's disk reads.
	 * Aborting `signal` (browser disconnect) cancels the transfer gateway-side.
	 */
	openByteStream(
		gatewayId: string,
		message: Record<string, unknown> & { type: string },
		signal?: AbortSignal
	): ReadableStream<Uint8Array> {
		const gateway = this.#gateways.get(gatewayId);
		if (!gateway) throw new Error(`gateway ${gatewayId} is offline`);
		const id = gateway.nextId();
		let finished = false;

		const cleanup = () => {
			finished = true;
			gateway.pending.delete(id);
		};

		const cancelUpstream = () => {
			if (finished) return;
			cleanup();
			try {
				gateway.socket.send(JSON.stringify({ id: gateway.nextId(), type: 'cancel', re: id }));
			} catch {
				// socket already gone
			}
		};

		return new ReadableStream<Uint8Array>(
			{
				start: (controller) => {
					gateway.pending.set(id, {
						timer: null,
						resolve: () => {
							// resp ok after FIN — stream already closed via the FIN frame.
							if (!finished) {
								cleanup();
								controller.close();
							}
						},
						reject: (err) => {
							if (finished) return;
							cleanup();
							controller.error(err);
						},
						onChunk: (payload, fin) => {
							if (finished) return;
							if (payload.byteLength > 0) controller.enqueue(payload);
							if (fin) {
								cleanup();
								controller.close();
							}
						}
					});
					signal?.addEventListener('abort', cancelUpstream, { once: true });
					gateway.socket.send(JSON.stringify({ ...message, id }));
				},
				pull: () => {
					if (finished) return;
					try {
						gateway.socket.send(
							JSON.stringify({
								id: gateway.nextId(),
								type: 'credit',
								re: id,
								bytes: DEFAULT_LIMITS.chunkBytes
							})
						);
					} catch {
						// socket gone; reject arrives via unregister
					}
				},
				cancel: cancelUpstream
			},
			new ByteLengthQueuingStrategy({ highWaterMark: 4 * DEFAULT_LIMITS.chunkBytes })
		);
	}

	#failAllPending(gateway: ConnectedGateway, error: Error): void {
		for (const pending of gateway.pending.values()) {
			if (pending.timer) clearTimeout(pending.timer);
			pending.reject(error);
		}
		gateway.pending.clear();
	}
}

export const registry = new GatewayRegistry();
