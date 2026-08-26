/**
 * Binary frame layout for bulk data (file ranges, HLS segments) multiplexed
 * over the gateway WebSocket alongside JSON control frames.
 *
 * Header (6 bytes):
 *   UInt32BE  requestId   — id of the request this payload answers
 *   UInt8     flags       — bit 0 (FIN): last frame for this request
 *   UInt8     reserved    — must be 0
 * followed by the payload bytes.
 */

export const BINARY_HEADER_BYTES = 6;
export const FLAG_FIN = 0x01;

export interface BinaryFrame {
	requestId: number;
	fin: boolean;
	payload: Uint8Array;
}

export function encodeBinaryFrame(frame: BinaryFrame): Uint8Array {
	if (!Number.isInteger(frame.requestId) || frame.requestId < 0 || frame.requestId > 0xffffffff) {
		throw new RangeError(`requestId out of uint32 range: ${frame.requestId}`);
	}
	const out = new Uint8Array(BINARY_HEADER_BYTES + frame.payload.byteLength);
	const view = new DataView(out.buffer);
	view.setUint32(0, frame.requestId);
	view.setUint8(4, frame.fin ? FLAG_FIN : 0);
	view.setUint8(5, 0);
	out.set(frame.payload, BINARY_HEADER_BYTES);
	return out;
}

export function decodeBinaryFrame(data: Uint8Array): BinaryFrame {
	if (data.byteLength < BINARY_HEADER_BYTES) {
		throw new RangeError(`binary frame too short: ${data.byteLength} bytes`);
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return {
		requestId: view.getUint32(0),
		fin: (view.getUint8(4) & FLAG_FIN) !== 0,
		payload: data.subarray(BINARY_HEADER_BYTES)
	};
}

/**
 * Per-connection message-id allocator. The hub uses odd ids, gateways even ids,
 * so the two sides can both initiate requests without collisions.
 */
export function createIdAllocator(side: 'hub' | 'gateway'): () => number {
	let next = side === 'hub' ? 1 : 2;
	return () => {
		const id = next;
		// Wrap within uint32 while preserving parity.
		next = next + 2 > 0xffffffff ? (side === 'hub' ? 1 : 2) : next + 2;
		return id;
	};
}
