import { describe, expect, it } from 'vitest';
import { parseInitTimescales, patchSegmentTfdt } from './mp4-patch.js';

function box(type: string, payload: Buffer): Buffer {
	const header = Buffer.alloc(8);
	header.writeUInt32BE(8 + payload.byteLength, 0);
	header.write(type, 4, 'latin1');
	return Buffer.concat([header, payload]);
}

function fullBoxPayload(version: number, body: Buffer): Buffer {
	const verFlags = Buffer.alloc(4);
	verFlags.writeUInt8(version, 0);
	return Buffer.concat([verFlags, body]);
}

function tkhd(trackId: number): Buffer {
	const body = Buffer.alloc(80); // v0: creation(4) modification(4) trackId(4) …
	body.writeUInt32BE(trackId, 8);
	return box('tkhd', fullBoxPayload(0, body));
}

function mdhd(timescale: number): Buffer {
	const body = Buffer.alloc(20); // v0: creation(4) modification(4) timescale(4) …
	body.writeUInt32BE(timescale, 8);
	return box('mdhd', fullBoxPayload(0, body));
}

function trak(trackId: number, timescale: number): Buffer {
	return box('trak', Buffer.concat([tkhd(trackId), box('mdia', mdhd(timescale))]));
}

function tfdtV1(base: bigint): Buffer {
	const body = Buffer.alloc(8);
	body.writeBigUInt64BE(base, 0);
	return box('tfdt', fullBoxPayload(1, body));
}

function traf(trackId: number, tfdtBase: bigint): Buffer {
	const tfhdBody = Buffer.alloc(4);
	tfhdBody.writeUInt32BE(trackId, 0);
	return box('traf', Buffer.concat([box('tfhd', fullBoxPayload(0, tfhdBody)), tfdtV1(tfdtBase)]));
}

describe('mp4 tfdt patching', () => {
	const init = box('moov', Buffer.concat([trak(1, 12288), trak(2, 44100)]));
	const segment = Buffer.concat([
		box('moof', Buffer.concat([traf(1, 0n), traf(2, 4410n)])),
		box('mdat', Buffer.from([1, 2, 3]))
	]);

	it('parses track timescales from init', () => {
		const timescales = parseInitTimescales(init);
		expect(timescales.get(1)).toBe(12288);
		expect(timescales.get(2)).toBe(44100);
	});

	it('shifts each traf tfdt by its own timescale', () => {
		const buf = Buffer.from(segment);
		patchSegmentTfdt(buf, parseInitTimescales(init), 280);
		// Re-read the two tfdt values.
		const values: bigint[] = [];
		let idx = buf.indexOf(Buffer.from('tfdt', 'latin1'));
		while (idx !== -1) {
			values.push(buf.readBigUInt64BE(idx + 4 + 4));
			idx = buf.indexOf(Buffer.from('tfdt', 'latin1'), idx + 4);
		}
		expect(values).toEqual([BigInt(280 * 12288), BigInt(280 * 44100) + 4410n]);
	});

	it('throws on unknown tracks', () => {
		const buf = Buffer.from(segment);
		expect(() => patchSegmentTfdt(buf, new Map([[9, 1000]]), 10)).toThrow(/unknown track/);
	});
});
