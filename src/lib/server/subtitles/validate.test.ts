import { describe, expect, it } from 'vitest';
import { looksLikeSubtitle } from './validate';

const enc = (s: string) => new TextEncoder().encode(s);

describe('looksLikeSubtitle', () => {
	it('accepts real subtitle formats', () => {
		expect(looksLikeSubtitle(enc('1\n00:00:01,000 --> 00:00:02,000\nHi'), 'srt')).toBe(true);
		expect(looksLikeSubtitle(enc('\uFEFFWEBVTT\n\n00:01.000 --> 00:02.000\nHi'), 'vtt')).toBe(true);
		expect(looksLikeSubtitle(enc('[Script Info]\nTitle: x\n[Events]\n'), 'ass')).toBe(true);
		const utf16 = new Uint8Array([
			0xff,
			0xfe,
			...Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi', 'utf16le')
		]);
		expect(looksLikeSubtitle(utf16, 'srt')).toBe(true);
	});

	it('rejects HTML pages, binaries, empties and mismatched formats', () => {
		expect(looksLikeSubtitle(enc('<!DOCTYPE html><html><body>Just a moment...'), 'srt')).toBe(
			false
		);
		expect(looksLikeSubtitle(enc('Wrong parameters.'), 'srt')).toBe(false);
		expect(looksLikeSubtitle(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]), 'srt')).toBe(
			false
		);
		expect(looksLikeSubtitle(new Uint8Array(0), 'srt')).toBe(false);
		expect(looksLikeSubtitle(enc('[Script Info]'), 'srt')).toBe(false);
		expect(looksLikeSubtitle(enc('1\n00:00:01,000 --> 00:00:02,000\nHi'), 'exe')).toBe(false);
	});
});
