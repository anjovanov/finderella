import { describe, expect, it } from 'vitest';
import type { TrickplayGeometry } from '@finderella/protocol';
import { buildTrickplayVtt, formatVttTime } from './vtt';

function geometry(overrides: Partial<TrickplayGeometry> = {}): TrickplayGeometry {
	return {
		version: 1,
		interval: 10,
		tileWidth: 320,
		tileHeight: 180,
		columns: 10,
		rows: 10,
		tiles: 720,
		sheets: 8,
		...overrides
	};
}

function cues(vtt: string): { timing: string; body: string }[] {
	return vtt
		.split('\n\n')
		.slice(1)
		.filter((block) => block.trim())
		.map((block) => {
			const [timing, body] = block.trim().split('\n');
			return { timing, body };
		});
}

describe('formatVttTime', () => {
	it('formats HH:MM:SS.mmm', () => {
		expect(formatVttTime(0)).toBe('00:00:00.000');
		expect(formatVttTime(59_999)).toBe('00:00:59.999');
		expect(formatVttTime(3_600_000)).toBe('01:00:00.000');
		expect(formatVttTime(36_000_000 + 61_500)).toBe('10:01:01.500');
	});
});

describe('buildTrickplayVtt', () => {
	it('starts with the WEBVTT header and one cue per tile', () => {
		const vtt = buildTrickplayVtt(geometry(), 7_200_000);
		expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
		expect(cues(vtt)).toHaveLength(720);
	});

	it('walks the sprite grid left to right, top to bottom, sheet by sheet', () => {
		const list = cues(buildTrickplayVtt(geometry(), 7_200_000));
		expect(list[0]).toEqual({
			timing: '00:00:00.000 --> 00:00:10.000',
			body: '0.jpg#xywh=0,0,320,180'
		});
		expect(list[1].body).toBe('0.jpg#xywh=320,0,320,180');
		expect(list[10].body).toBe('0.jpg#xywh=0,180,320,180');
		expect(list[99].body).toBe('0.jpg#xywh=2880,1620,320,180');
		expect(list[100]).toEqual({
			timing: '00:16:40.000 --> 00:16:50.000',
			body: '1.jpg#xywh=0,0,320,180'
		});
	});

	it('ends the last cue at the file duration', () => {
		const list = cues(buildTrickplayVtt(geometry({ tiles: 721 }), 7_203_250));
		expect(list).toHaveLength(721);
		expect(list.at(-1)).toEqual({
			timing: '02:00:00.000 --> 02:00:03.250',
			body: '7.jpg#xywh=0,360,320,180'
		});
	});

	it('truncates to the sheets that actually exist', () => {
		const list = cues(buildTrickplayVtt(geometry({ tiles: 720, sheets: 7 }), 7_200_000));
		expect(list).toHaveLength(700);
	});

	it('produces no cues for a zero-length file', () => {
		expect(cues(buildTrickplayVtt(geometry({ tiles: 0, sheets: 0 }), 0))).toHaveLength(0);
	});
});
