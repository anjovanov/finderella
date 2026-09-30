/**
 * Downmix levels an AC-3 / E-AC-3 stream carries in its frame header (the
 * "Lo/Ro" center and surround mix levels, ATSC A/52). ffmpeg honours them
 * when a transcode mixes 5.1 down to stereo, so the in-browser conversion
 * reads them too — otherwise a remux plays at a different loudness than the
 * same file transcoded (an E-AC-3 stream at −4.5/−6 dB came out 1.3 dB louder
 * with the generic −3 dB). Mirrors ffmpeg's `ac3_parse_header` /
 * `ff_eac3_parse_header`, including its defaults when the metadata is absent.
 */

/** Linear gains of the stream's center and surround channels in a stereo downmix. */
export interface Ac3MixLevels {
	center: number;
	surround: number;
}

/** ffmpeg's `gain_levels`: +3, +1.5, 0, −1.5, −3, −4.5, −6 dB, −∞, −9 dB. */
const GAIN_LEVELS = [
	Math.SQRT2,
	1.189207115,
	1,
	0.840896415,
	Math.SQRT1_2,
	0.594603558,
	0.5,
	0,
	0.354813389
];
/** AC-3 `cmixlev` / `surmixlev` (2 bits) → index into GAIN_LEVELS. */
const AC3_CENTER = [4, 5, 6, 5];
const AC3_SURROUND = [4, 6, 7, 6];
/** Used when a stream doesn't say (ffmpeg's defaults): −4.5 dB center, −6 dB surround. */
const DEFAULT_CENTER = 5;
const DEFAULT_SURROUND = 6;

class BitReader {
	#bit = 0;
	constructor(private readonly bytes: Uint8Array) {}
	read(count: number): number {
		let value = 0;
		for (let i = 0; i < count; i++) {
			const byte = this.bytes[this.#bit >> 3];
			if (byte === undefined) throw new RangeError('AC-3 header truncated');
			value = (value << 1) | ((byte >> (7 - (this.#bit & 7))) & 1);
			this.#bit++;
		}
		return value;
	}
	skip(count: number): void {
		this.#bit += count;
	}
	flag(): boolean {
		return this.read(1) === 1;
	}
}

const clip = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The mix levels of the frame at the start of `frame` (an AC-3 or E-AC-3
 * packet), or null when it isn't one or is cut short.
 */
export function ac3MixLevels(frame: Uint8Array): Ac3MixLevels | null {
	if (frame.length < 8 || frame[0] !== 0x0b || frame[1] !== 0x77) return null;
	// bsid sits in the same place in both syntaxes (bits 40–44).
	const bsid = frame[5] >> 3;
	try {
		const levels = bsid <= 10 ? parseAc3(new BitReader(frame)) : parseEac3(new BitReader(frame));
		return { center: GAIN_LEVELS[levels.center], surround: GAIN_LEVELS[levels.surround] };
	} catch {
		return null;
	}
}

function parseAc3(bits: BitReader): { center: number; surround: number } {
	bits.skip(16 + 16 + 2 + 6); // syncword, crc1, fscod, frmsizecod
	const bsid = bits.read(5);
	bits.skip(3); // bsmod
	const acmod = bits.read(3);
	let center = DEFAULT_CENTER;
	let surround = DEFAULT_SURROUND;
	if (acmod & 1 && acmod !== 1) center = AC3_CENTER[bits.read(2)];
	if (acmod & 4) surround = AC3_SURROUND[bits.read(2)];
	if (bsid !== 6) return { center, surround };
	// Annex D alternate syntax: the Lo/Ro levels in xbsi1 replace the above.
	if (acmod === 2) bits.skip(2); // dsurmod
	bits.skip(1 + 5); // lfeon, dialnorm
	if (bits.flag()) bits.skip(8); // compr
	if (bits.flag()) bits.skip(8); // langcod
	if (bits.flag()) bits.skip(5 + 2); // mixlevel, roomtyp
	if (acmod === 0) {
		bits.skip(5); // dialnorm2
		if (bits.flag()) bits.skip(8);
		if (bits.flag()) bits.skip(8);
		if (bits.flag()) bits.skip(5 + 2);
	}
	bits.skip(1 + 1); // copyrightb, origbs
	if (bits.flag()) {
		bits.skip(2 + 3 + 3); // dmixmod, ltrtcmixlev, ltrtsurmixlev
		center = bits.read(3);
		surround = clip(bits.read(3), 3, 7);
	}
	return { center, surround };
}

function parseEac3(bits: BitReader): { center: number; surround: number } {
	bits.skip(16); // syncword
	const strmtyp = bits.read(2);
	bits.skip(3 + 11 + 2 + 2); // substreamid, frmsiz, fscod, fscod2 / numblkscod
	const acmod = bits.read(3);
	bits.skip(1 + 5 + 5); // lfeon, bsid, dialnorm
	if (bits.flag()) bits.skip(8); // compr
	if (acmod === 0) {
		bits.skip(5); // dialnorm2
		if (bits.flag()) bits.skip(8); // compr2
	}
	if (strmtyp === 1 && bits.flag()) bits.skip(16); // chanmap
	let center = DEFAULT_CENTER;
	let surround = DEFAULT_SURROUND;
	if (bits.flag() && acmod > 2) {
		// mixmdate: mixing metadata present
		bits.skip(2); // dmixmod
		if (acmod & 1) {
			bits.skip(3); // ltrtcmixlev
			center = bits.read(3);
		}
		if (acmod & 4) {
			bits.skip(3); // ltrtsurmixlev
			surround = clip(bits.read(3), 3, 7);
		}
	}
	return { center, surround };
}
