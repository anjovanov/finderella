import { describe, expect, it } from 'vitest';
import { legacyCodePage, normalizeSubtitleEncoding, sanitizeSubtitleText } from './charset';

const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('normalizeSubtitleEncoding', () => {
	it('keeps UTF-8, strips BOMs, and decodes legacy code pages by language', () => {
		expect(dec(normalizeSubtitleEncoding(new TextEncoder().encode('čšž'), 'hr'))).toBe('čšž');
		expect(
			dec(normalizeSubtitleEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]), 'en'))
		).toBe('hi');
		// windows-1250: č = 0xE8, š = 0x9A
		expect(dec(normalizeSubtitleEncoding(new Uint8Array([0xe8, 0x9a]), 'hr'))).toBe('čš');
		// windows-1251: Љ = 0x8A
		expect(dec(normalizeSubtitleEncoding(new Uint8Array([0x8a]), 'sr', 'cyrillic'))).toBe('Љ');
		// Latin-1 / windows-1252: é = 0xE9
		expect(dec(normalizeSubtitleEncoding(new Uint8Array([0xe9]), 'fr'))).toBe('é');
		expect(dec(normalizeSubtitleEncoding(new Uint8Array([0xff, 0xfe, 0x68, 0x00]), 'en'))).toBe(
			'h'
		);
	});

	it('picks code pages by language and script', () => {
		expect(legacyCodePage('sr')).toBe('windows-1250');
		expect(legacyCodePage('sr', 'cyrillic')).toBe('windows-1251');
		expect(legacyCodePage('en')).toBe('windows-1252');
		expect(legacyCodePage('el')).toBe('windows-1253');
	});
});

describe('sanitizeSubtitleText', () => {
	it('drops VTT STYLE/REGION blocks and control characters but keeps cues', () => {
		const vtt =
			'WEBVTT\n\nSTYLE\n::cue { background-image: url(https://x/y.png) }\n\nREGION\nid:r1\n\n00:01.000 --> 00:02.000\nHi there\n';
		const out = sanitizeSubtitleText(vtt, 'vtt');
		expect(out).not.toContain('STYLE');
		expect(out).not.toContain('REGION');
		expect(out).not.toContain('url(');
		expect(out).toContain('00:01.000 --> 00:02.000\nHi there');
		const dialogue = 'WEBVTT\n\n00:01.000 --> 00:02.000\nSTYLE is everything\n';
		expect(sanitizeSubtitleText(dialogue, 'vtt')).toBe(dialogue);
		expect(
			sanitizeSubtitleText(
				'1\r\n00:00:01,000 --> 00:00:02,000\r\n<script>x</script><i>ok</i>',
				'srt'
			)
		).toBe('1\n00:00:01,000 --> 00:00:02,000\nx<i>ok</i>');
		expect(sanitizeSubtitleText('[Script Info]\r\n', 'ass')).toBe('[Script Info]\r\n');
	});
});
