import type { WebSocket } from 'ws';
import {
	createIdAllocator,
	decodeBinaryFrame,
	DEFAULT_LIMITS,
	type AgentCapabilities,
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

export interface ConnectedAgent {
	agentId: string;
	socket: WebSocket;
	nextId: () => number;
	pending: Map<number, PendingRequest>;
	connectedAt: Date;
	lastSeenAt: Date;
	agentVersion: string;
	capabilities: AgentCapabilities;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * In-memory map of live agent connections plus hub→agent request correlation.
 * Single-process by design (one VPS): if the hub is ever scaled out, this —
 * and SessionManager — are what need a shared backing store.
 */
class AgentRegistry {
	#agents = new Map<string, ConnectedAgent>();

	register(input: {
		agentId: string;
		socket: WebSocket;
		agentVersion: string;
		capabilities: AgentCapabilities;
	}): ConnectedAgent {
		const existing = this.#agents.get(input.agentId);
		if (existing) {
			log.warn({ agentId: input.agentId }, 'agent reconnected; closing previous socket');
			this.#failAllPending(existing, new Error('superseded by a new connection'));
			existing.socket.close(4000, 'superseded');
		}
		const agent: ConnectedAgent = {
			...input,
			nextId: createIdAllocator('hub'),
			pending: new Map(),
			connectedAt: new Date(),
			lastSeenAt: new Date()
		};
		this.#agents.set(input.agentId, agent);
		log.info({ agentId: input.agentId, agentVersion: input.agentVersion }, 'agent connected');
		return agent;
	}

	unregister(agentId: string, socket: WebSocket): void {
		const agent = this.#agents.get(agentId);
		if (!agent || agent.socket !== socket) return; // stale close from a superseded socket
		this.#failAllPending(agent, new Error('agent disconnected'));
		this.#agents.delete(agentId);
		log.info({ agentId }, 'agent disconnected');
	}

	get(agentId: string): ConnectedAgent | undefined {
		return this.#agents.get(agentId);
	}

	list(): ConnectedAgent[] {
		return [...this.#agents.values()];
	}

	isOnline(agentId: string): boolean {
		return this.#agents.has(agentId);
	}

	touch(agentId: string): void {
		const agent = this.#agents.get(agentId);
		if (agent) agent.lastSeenAt = new Date();
	}

	/** Fire-and-forget message to an agent. Throws if the agent is offline. */
	send(agentId: string, message: Record<string, unknown> & { type: string }): void {
		const agent = this.#agents.get(agentId);
		if (!agent) throw new Error(`agent ${agentId} is offline`);
		agent.socket.send(JSON.stringify({ ...message, id: agent.nextId() }));
	}

	/** Send a request down the tunnel and await the agent's `resp`. */
	request(
		agentId: string,
		message: Record<string, unknown> & { type: string },
		opts: { timeoutMs?: number } = {}
	): Promise<unknown> {
		const agent = this.#agents.get(agentId);
		if (!agent) return Promise.reject(new Error(`agent ${agentId} is offline`));
		const id = agent.nextId();
		const timeoutMs = opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				agent.pending.delete(id);
				reject(new Error(`request ${message.type} to agent ${agentId} timed out`));
			}, timeoutMs);
			agent.pending.set(id, { resolve, reject, timer });
			agent.socket.send(JSON.stringify({ ...message, id }));
		});
	}

	handleResp(agent: ConnectedAgent, resp: RespMessage): void {
		const pending = agent.pending.get(resp.re);
		if (!pending) return; // late response after timeout/cancel/FIN
		agent.pending.delete(resp.re);
		if (pending.timer) clearTimeout(pending.timer);
		if (resp.ok) pending.resolve(resp.data);
		else pending.reject(new Error(resp.error ?? 'agent request failed'));
	}

	handleBinaryFrame(agent: ConnectedAgent, data: Uint8Array): void {
		let frame;
		try {
			frame = decodeBinaryFrame(data);
		} catch (err) {
			log.warn({ agentId: agent.agentId, err }, 'undecodable binary frame');
			return;
		}
		const pending = agent.pending.get(frame.requestId);
		pending?.onChunk?.(frame.payload, frame.fin);
	}

	/**
	 * Open a hub→agent byte stream (file range, HLS segment). Returns a web
	 * ReadableStream whose pull() replenishes the agent's credit window, so a
	 * slow browser applies backpressure all the way to the agent's disk reads.
	 * Aborting `signal` (browser disconnect) cancels the transfer agent-side.
	 */
	openByteStream(
		agentId: string,
		message: Record<string, unknown> & { type: string },
		signal?: AbortSignal
	): ReadableStream<Uint8Array> {
		const agent = this.#agents.get(agentId);
		if (!agent) throw new Error(`agent ${agentId} is offline`);
		const id = agent.nextId();
		let finished = false;

		const cleanup = () => {
			finished = true;
			agent.pending.delete(id);
		};

		const cancelUpstream = () => {
			if (finished) return;
			cleanup();
			try {
				agent.socket.send(JSON.stringify({ id: agent.nextId(), type: 'cancel', re: id }));
			} catch {
				// socket already gone
			}
		};

		return new ReadableStream<Uint8Array>(
			{
				start: (controller) => {
					agent.pending.set(id, {
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
					agent.socket.send(JSON.stringify({ ...message, id }));
				},
				pull: () => {
					if (finished) return;
					try {
						agent.socket.send(
							JSON.stringify({
								id: agent.nextId(),
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

	#failAllPending(agent: ConnectedAgent, error: Error): void {
		for (const pending of agent.pending.values()) {
			if (pending.timer) clearTimeout(pending.timer);
			pending.reject(error);
		}
		agent.pending.clear();
	}
}

export const registry = new AgentRegistry();
