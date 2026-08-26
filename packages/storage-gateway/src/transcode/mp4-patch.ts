/**
 * Minimal fmp4 box surgery: shift a segment's tfdt (baseMediaDecodeTime)
 * values onto the absolute media timeline after a mid-file ffmpeg restart
 * (each run's output is 0-based; see ffmpeg.ts). Box sizes never change, so
 * this is safe in-place patching.
 */

interface Box {
	type: string;
	start: number;
	size: number;
	payloadStart: number;
}

function* boxes(buf: Buffer, start: number, end: number): Generator<Box> {
	let offset = start;
	while (offset + 8 <= end) {
		let size = buf.readUInt32BE(offset);
		const type = buf.toString('latin1', offset + 4, offset + 8);
		let payloadStart = offset + 8;
		if (size === 1) {
			const large = buf.readBigUInt64BE(offset + 8);
			if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('box too large');
			size = Number(large);
			payloadStart = offset + 16;
		} else if (size === 0) {
			size = end - offset; // box extends to end
		}
		if (size < 8 || offset + size > end) throw new Error(`malformed box ${type}`);
		yield { type, start: offset, size, payloadStart };
		offset += size;
	}
}

function findChild(buf: Buffer, parent: Box, type: string): Box | null {
	for (const child of boxes(buf, parent.payloadStart, parent.start + parent.size)) {
		if (child.type === type) return child;
	}
	return null;
}

/** trackId → mdhd timescale, from an init segment's moov. */
export function parseInitTimescales(init: Buffer): Map<number, number> {
	const result = new Map<number, number>();
	for (const top of boxes(init, 0, init.byteLength)) {
		if (top.type !== 'moov') continue;
		for (const trak of boxes(init, top.payloadStart, top.start + top.size)) {
			if (trak.type !== 'trak') continue;
			const tkhd = findChild(init, trak, 'tkhd');
			const mdia = findChild(init, trak, 'mdia');
			const mdhd = mdia && findChild(init, mdia, 'mdhd');
			if (!tkhd || !mdhd) continue;
			const tkhdVersion = init.readUInt8(tkhd.payloadStart);
			const trackId =
				tkhdVersion === 1
					? init.readUInt32BE(tkhd.payloadStart + 4 + 16)
					: init.readUInt32BE(tkhd.payloadStart + 4 + 8);
			const mdhdVersion = init.readUInt8(mdhd.payloadStart);
			const timescale =
				mdhdVersion === 1
					? init.readUInt32BE(mdhd.payloadStart + 4 + 16)
					: init.readUInt32BE(mdhd.payloadStart + 4 + 8);
			result.set(trackId, timescale);
		}
	}
	if (result.size === 0) throw new Error('no tracks found in init segment');
	return result;
}

/** Add offsetSeconds to every traf's tfdt, using each track's own timescale. */
export function patchSegmentTfdt(
	segment: Buffer,
	timescales: Map<number, number>,
	offsetSeconds: number
): void {
	for (const top of boxes(segment, 0, segment.byteLength)) {
		if (top.type !== 'moof') continue;
		for (const traf of boxes(segment, top.payloadStart, top.start + top.size)) {
			if (traf.type !== 'traf') continue;
			const tfhd = findChild(segment, traf, 'tfhd');
			const tfdt = findChild(segment, traf, 'tfdt');
			if (!tfhd || !tfdt) continue;
			const trackId = segment.readUInt32BE(tfhd.payloadStart + 4);
			const timescale = timescales.get(trackId);
			if (!timescale) throw new Error(`unknown track ${trackId} in segment`);
			const delta = Math.round(offsetSeconds * timescale);
			const version = segment.readUInt8(tfdt.payloadStart);
			if (version === 1) {
				const current = segment.readBigUInt64BE(tfdt.payloadStart + 4);
				segment.writeBigUInt64BE(current + BigInt(delta), tfdt.payloadStart + 4);
			} else {
				const current = segment.readUInt32BE(tfdt.payloadStart + 4);
				const next = current + delta;
				if (next > 0xffffffff) throw new Error('tfdt v0 overflow while patching');
				segment.writeUInt32BE(next, tfdt.payloadStart + 4);
			}
		}
	}
}
