/**
 * Audio fingerprints travel as base64 of little-endian uint32 values. An
 * explicit DataView keeps the encoding independent of platform endianness
 * and of the source buffer's alignment.
 */

export function encodeFingerprint(values: Uint32Array): string {
	const bytes = new Uint8Array(values.length * 4);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < values.length; i++) view.setUint32(i * 4, values[i], true);
	return bytesToBase64(bytes);
}

/** Decodes `encodeFingerprint` output; trailing bytes that don't form a whole value are ignored. */
export function decodeFingerprint(encoded: string): Uint32Array {
	const bytes = base64ToBytes(encoded);
	const count = Math.floor(bytes.length / 4);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const out = new Uint32Array(count);
	for (let i = 0; i < count; i++) out[i] = view.getUint32(i * 4, true);
	return out;
}

// Buffer exists on both ends (Node gateway, Node hub); the codec never runs in a browser.
function bytesToBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

function base64ToBytes(encoded: string): Uint8Array {
	return new Uint8Array(Buffer.from(encoded, 'base64'));
}
