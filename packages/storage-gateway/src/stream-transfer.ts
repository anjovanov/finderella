import { encodeBinaryFrame, type HubLimits } from '@finderella/protocol';
import type { GatewayConnection } from './connection.js';
import { CreditGate } from './credit-gate.js';
import type { Transfer } from './file-reader.js';

/**
 * Like FileTransfer, but over a byte source of unknown length (a subtitle
 * track being converted as it's read). Chunks go out as non-FIN frames under
 * the same credit window; the end is an empty FIN frame + `resp ok`. A source
 * that throws yields `resp ok:false` (no FIN) so the hub errors the body
 * instead of ending it cleanly.
 */
export class StreamTransfer implements Transfer {
	#conn: GatewayConnection;
	#requestId: number;
	#source: AsyncIterable<Uint8Array>;
	#chunkBytes: number;
	#gate: CreditGate;

	constructor(
		conn: GatewayConnection,
		requestId: number,
		source: AsyncIterable<Uint8Array>,
		limits: HubLimits
	) {
		this.#conn = conn;
		this.#requestId = requestId;
		this.#source = source;
		this.#chunkBytes = limits.chunkBytes;
		this.#gate = new CreditGate(limits.creditWindowBytes);
	}

	addCredit(bytes: number): void {
		this.#gate.add(bytes);
	}

	abort(): void {
		this.#gate.abort();
	}

	async run(): Promise<void> {
		const requestId = this.#requestId;
		const gate = this.#gate;
		try {
			for await (const chunk of this.#source) {
				let offset = 0;
				while (offset < chunk.byteLength && !gate.aborted) {
					await gate.wait();
					if (gate.aborted) break;
					const size = Math.min(this.#chunkBytes, chunk.byteLength - offset, gate.credit);
					this.#conn.sendBinary(
						encodeBinaryFrame({
							requestId,
							fin: false,
							payload: chunk.subarray(offset, offset + size)
						})
					);
					gate.consume(size);
					offset += size;
				}
				if (gate.aborted) break;
			}
			if (gate.aborted) return; // hub cancelled; no resp expected
			this.#conn.sendBinary(
				encodeBinaryFrame({ requestId, fin: true, payload: new Uint8Array(0) })
			);
			this.#conn.send({ type: 'resp', re: requestId, ok: true });
		} catch (err) {
			if (!gate.aborted) {
				this.#conn.send({ type: 'resp', re: requestId, ok: false, error: (err as Error).message });
			}
		}
	}
}
