import { describe, expect, it } from 'vitest';
import { ac3MixLevels } from './ac3-downmix';

const hex = (h: string) => Uint8Array.from(h.match(/../g)!, (b) => parseInt(b, 16));
const db = (gain: number) => (gain === 0 ? -Infinity : Math.round(20 * Math.log10(gain) * 10) / 10);

/** First 24 bytes of real frames; expected levels are what ffprobe reports as downmix side data. */
const FRAMES: [name: string, header: string, center: number, surround: number][] = [
	['AC-3 5.1 (a TV episode)', '0b772c671c30e1cffdc9c924a00007dfda96840404041080', -3, -3],
	['E-AC-3 5.1 with mixing metadata', '0b77047f3f85ffe8c20808800d406539ae740a735ce6e100', -4.5, -6],
	['E-AC-3 5.1 (DDP5.1 WEB-DL)', '0b7704ff3f87ffe8d00300108c23202118463e08030c30c3', -4.5, -6],
	[
		'AC-3 from ffmpeg, default levels',
		'0b77054e5e40ebf8403eff9df1662cc598b3167ffeef9f3e',
		-4.5,
		-6
	],
	[
		'AC-3, center −6 / surround off',
		'0b7704ce5e40f5f8403eff9df1662cc598b3167ffeef9f3e',
		-6,
		-Infinity
	],
	[
		'E-AC-3 from ffmpeg, default levels',
		'0b7703ce7f87c000208421084208421083081fce0b22c8b2',
		-4.5,
		-6
	],
	[
		'E-AC-3, Lo/Ro center −6 / surround −1.5',
		'0b7703ce7f87d86cc0000208421084208421083081fce0b2',
		-6,
		-1.5
	]
];

describe('ac3MixLevels', () => {
	it.each(FRAMES)('%s', (_name, header, center, surround) => {
		const levels = ac3MixLevels(hex(header));
		expect(levels).not.toBeNull();
		expect(db(levels!.center)).toBe(center);
		expect(db(levels!.surround)).toBe(surround);
	});

	it('rejects anything that is not an AC-3 frame', () => {
		expect(ac3MixLevels(hex('000000000000000000000000'))).toBeNull();
		expect(ac3MixLevels(hex('0b77'))).toBeNull();
	});
});
