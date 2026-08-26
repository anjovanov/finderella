import { open } from 'node:fs/promises';
import { encodeBinaryFrame, type HubLimits } from '@finderella/protocol';
import type { AgentConnection } from './connection.js';

export interface TransferRequest {
	requestId: number;
	absPath: string;
	offset: number;
	/** Bytes to send; Infinity = to end of file. */
	length: number;
}

/**
 * One in-flight byte transfer (file range or HLS asset): reads the requested
 * range and ships it as credit-gated binary frames. The hub replenishes
 * credit as the browser drains; `cancel` aborts mid-flight. Callers are
 * responsible for path validation.
 */
export class FileTransfer {
	#conn: AgentConnection;
	#req: TransferRequest;
	#chunkBytes: number;
	#credit: number;
	#creditWaiter: (() => void) | null = null;
	#aborted = false;

	constructor(conn: AgentConnection, req: TransferRequest, limits: HubLimits) {
		this.#conn = conn;
		this.#req = req;
		this.#chunkBytes = limits.chunkBytes;
		this.#credit = limits.creditWindowBytes;
	}

	addCredit(bytes: number): void {
		this.#credit += bytes;
		this.#creditWaiter?.();
	}

	abort(): void {
		this.#aborted = true;
		this.#creditWaiter?.();
	}

	async #waitForCredit(): Promise<void> {
		while (this.#credit <= 0 && !this.#aborted) {
			await new Promise<void>((resolveWait) => {
				this.#creditWaiter = resolveWait;
			});
			this.#creditWaiter = null;
		}
	}

	async run(): Promise<void> {
		const { requestId, absPath, offset } = this.#req;
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
			while (remaining > 0 && !this.#aborted) {
				await this.#waitForCredit();
				if (this.#aborted) break;
				const readSize = Math.min(this.#chunkBytes, remaining, this.#credit);
				const buffer = Buffer.allocUnsafe(readSize);
				const { bytesRead } = await handle.read(buffer, 0, readSize, position);
				if (bytesRead === 0) break; // EOF before expected end (file shrank)
				position += bytesRead;
				remaining -= bytesRead;
				this.#credit -= bytesRead;
				const fin = remaining === 0;
				this.#conn.sendBinary(
					encodeBinaryFrame({ requestId, fin, payload: buffer.subarray(0, bytesRead) })
				);
				if (fin) sentAny = true;
			}
			if (this.#aborted) return; // hub cancelled; no resp expected
			if (!sentAny) {
				// Empty range or early EOF — still FIN the stream so the hub settles.
				this.#conn.sendBinary(
					encodeBinaryFrame({ requestId, fin: true, payload: new Uint8Array(0) })
				);
			}
			this.#conn.send({ type: 'resp', re: requestId, ok: true });
		} catch (err) {
			if (!this.#aborted) {
				this.#conn.send({ type: 'resp', re: requestId, ok: false, error: (err as Error).message });
			}
		} finally {
			await handle.close().catch(() => {});
		}
	}
}
