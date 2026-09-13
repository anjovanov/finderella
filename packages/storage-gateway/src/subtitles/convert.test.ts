import { describe, expect, it } from 'vitest';
import { decodeSubtitleText, normalizeVtt, srtToVtt, subtitleArgs } from './convert.js';

describe('decodeSubtitleText', () => {
	it('strips a UTF-8 BOM and falls back to windows-1252 for invalid UTF-8', () => {
		expect(decodeSubtitleText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]))).toBe('hi');
		expect(decodeSubtitleText(new TextEncoder().encode('café'))).toBe('café');
		// Latin-1 "café" — 0xe9 alone is not valid UTF-8.
		expect(decodeSubtitleText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
		expect(decodeSubtitleText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]))).toBe('hi');
	});
});

describe('srtToVtt', () => {
	it('converts timings, drops cue numbers and CRLF, keeps multi-line text', () => {
		const srt =
			'1\r\n00:00:01,000 --> 00:00:03,500\r\nHello\r\n<i>world</i>\r\n\r\n2\r\n01:02:03,4 --> 01:02:04,000\r\n{\\an8}Top\r\n';
		expect(srtToVtt(srt)).toBe(
			'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello\n<i>world</i>\n\n01:02:03.400 --> 01:02:04.000\nTop\n'
		);
	});

	it('skips malformed and empty blocks', () => {
		expect(
			srtToVtt(
				'garbage\n\n3\n00:00:01,000 --> 00:00:02,000\n\n\n4\n00:00:05,000 --> 00:00:06,000\nok'
			)
		).toBe('WEBVTT\n\n00:00:05.000 --> 00:00:06.000\nok\n');
	});
});

describe('normalizeVtt', () => {
	it('adds a missing header and normalizes line endings', () => {
		expect(normalizeVtt('WEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nx')).toBe(
			'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx'
		);
		expect(normalizeVtt('00:00:00.000 --> 00:00:01.000\nx').startsWith('WEBVTT\n\n')).toBe(true);
	});
});

describe('subtitleArgs', () => {
	function valueAfter(args: string[], flag: string): string | undefined {
		const i = args.indexOf(flag);
		return i === -1 ? undefined : args[i + 1];
	}

	it('maps the absolute stream index of an embedded track to WebVTT on stdout', () => {
		const args = subtitleArgs({ input: '/media/movie.mkv', streamIndex: 4 });
		expect(valueAfter(args, '-i')).toBe('/media/movie.mkv');
		expect(valueAfter(args, '-map')).toBe('0:4');
		expect(valueAfter(args, '-c:s')).toBe('webvtt');
		expect(valueAfter(args, '-f')).toBe('webvtt');
		expect(args.at(-1)).toBe('pipe:1');
		expect(args).toContain('-nostdin');
	});

	it('takes the first subtitle stream of a sidecar file', () => {
		expect(valueAfter(subtitleArgs({ input: '/tmp/x.ass' }), '-map')).toBe('0:s:0');
	});
});
