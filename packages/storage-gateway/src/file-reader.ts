import { open } from 'node:fs/promises';
import { encodeBinaryFrame, type HubLimits } from '@finderella/protocol';
import type { GatewayConnection } from './connection.js';
import { CreditGate } from './credit-gate.js';

export interface TransferRequest {
	requestId: number;
	absPath: string;
	offset: number;
	/** Bytes to send; Infinity = to end of file. */
	length: number;
}

/** What the CLI needs from any in-flight transfer to route `credit` / `cancel`. */
export interface Transfer {
	addCredit(bytes: number): void;
	abort(): void;
}

/**
 * One in-flight byte transfer (file range or HLS asset): reads the requested
 * range and ships it as credit-gated binary frames. The hub replenishes
 * credit as the browser drains; `cancel` aborts mid-flight. Callers are
 * responsible for path validation.
 */
export class FileTransfer implements Transfer {
	#conn: GatewayConnection;
	#req: TransferRequest;
	#chunkBytes: number;
	#gate: CreditGate;

	constructor(conn: GatewayConnection, req: TransferRequest, limits: HubLimits) {
		this.#conn = conn;
		this.#req = req;
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
		const { requestId, absPath, offset } = this.#req;
		const gate = this.#gate;
		let handle;
		try {
			handle = await open(absPath, 'r');
		} catch (err) {
			this.#conn.send({ type: 'resp', re: requestId, ok: false, error: (err as Error).message });
			return;
		}

		try {
			let length = this.#req.length;
			if (!Number.isFinite(length)) {
				const stat = await handle.stat();
				length = Math.max(0, stat.size - offset);
			}
			let position = offset;
			let remaining = length;
			let sentAny = false;
			while (remaining > 0 && !gate.aborted) {
				await gate.wait();
				if (gate.aborted) break;
				const readSize = Math.min(this.#chunkBytes, remaining, gate.credit);
				const buffer = Buffer.allocUnsafe(readSize);
				const { bytesRead } = await handle.read(buffer, 0, readSize, position);
				if (bytesRead === 0) break; // EOF before expected end (file shrank)
				position += bytesRead;
				remaining -= bytesRead;
				gate.consume(bytesRead);
				const fin = remaining === 0;
				this.#conn.sendBinary(
					encodeBinaryFrame({ requestId, fin, payload: buffer.subarray(0, bytesRead) })
				);
				if (fin) sentAny = true;
			}
			if (gate.aborted) return; // hub cancelled; no resp expected
			if (!sentAny) {
				// Empty range or early EOF — still FIN the stream so the hub settles.
				this.#conn.sendBinary(
					encodeBinaryFrame({ requestId, fin: true, payload: new Uint8Array(0) })
				);
			}
			this.#conn.send({ type: 'resp', re: requestId, ok: true });
		} catch (err) {
			if (!gate.aborted) {
				this.#conn.send({ type: 'resp', re: requestId, ok: false, error: (err as Error).message });
			}
		} finally {
			await handle.close().catch(() => {});
		}
	}
}
