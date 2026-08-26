import { describe, expect, it } from 'vitest';
import {
	BINARY_HEADER_BYTES,
	createIdAllocator,
	decodeBinaryFrame,
	encodeBinaryFrame
} from './framing.js';
import { parseGatewayMessage, parseHubMessage } from './messages.js';

describe('binary framing', () => {
	it('round-trips a frame', () => {
		const payload = new Uint8Array([1, 2, 3, 250, 251, 252]);
		const encoded = encodeBinaryFrame({ requestId: 7, fin: false, payload });
		expect(encoded.byteLength).toBe(BINARY_HEADER_BYTES + payload.byteLength);
		const decoded = decodeBinaryFrame(encoded);
		expect(decoded.requestId).toBe(7);
		expect(decoded.fin).toBe(false);
		expect(Array.from(decoded.payload)).toEqual(Array.from(payload));
	});

	it('round-trips FIN and empty payloads', () => {
		const decoded = decodeBinaryFrame(
			encodeBinaryFrame({ requestId: 0xffffffff, fin: true, payload: new Uint8Array(0) })
		);
		expect(decoded.requestId).toBe(0xffffffff);
		expect(decoded.fin).toBe(true);
		expect(decoded.payload.byteLength).toBe(0);
	});

	it('decodes frames from an offset view (WS buffers are often pooled)', () => {
		const encoded = encodeBinaryFrame({ requestId: 42, fin: true, payload: new Uint8Array([9]) });
		const pooled = new Uint8Array(encoded.byteLength + 8);
		pooled.set(encoded, 8);
		const view = pooled.subarray(8);
		const decoded = decodeBinaryFrame(view);
		expect(decoded.requestId).toBe(42);
		expect(Array.from(decoded.payload)).toEqual([9]);
	});

	it('rejects out-of-range ids and short frames', () => {
		expect(() =>
			encodeBinaryFrame({ requestId: 0x1_0000_0000, fin: false, payload: new Uint8Array(0) })
		).toThrow(RangeError);
		expect(() => decodeBinaryFrame(new Uint8Array(3))).toThrow(RangeError);
	});
});

describe('id allocation', () => {
	it('keeps hub ids odd and gateway ids even', () => {
		const hub = createIdAllocator('hub');
		const gateway = createIdAllocator('gateway');
		expect([hub(), hub(), hub()]).toEqual([1, 3, 5]);
		expect([gateway(), gateway(), gateway()]).toEqual([2, 4, 6]);
	});
});

describe('message parsing', () => {
	it('accepts a valid hello', () => {
		const result = parseGatewayMessage(
			JSON.stringify({
				id: 2,
				type: 'hello',
				protocolVersion: 1,
				gatewayVersion: '0.0.1',
				capabilities: { ffmpeg: false, hwaccels: [] }
			})
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.message.type).toBe('hello');
	});

	it('rejects unknown types and malformed JSON', () => {
		expect(parseGatewayMessage('{"id":1,"type":"nope"}').ok).toBe(false);
		expect(parseGatewayMessage('not json').ok).toBe(false);
		expect(parseHubMessage('{"id":1,"type":"hello"}').ok).toBe(false);
	});
});
