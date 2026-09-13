import { MAX_SUBTITLE_DOWNLOAD_BYTES } from './safe-fetch';

/**
 * Cheap sanity check before a downloaded file is trusted as a subtitle: text
 * only, no HTML (a provider's error/challenge page saved under a .srt name),
 * and the format's own signature somewhere in the head.
 */

const SRT_TIMING = /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}/;
const VTT_TIMING = /(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}\.\d{3}/;
const HTML_HEAD = /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i;
/** A UTF-8 BOM as latin1 text, or a real one. */
const BOM = /^(\uFEFF|\u00EF\u00BB\u00BF)/;

export function looksLikeSubtitle(bytes: Uint8Array, format: string): boolean {
	if (bytes.length === 0 || bytes.length > MAX_SUBTITLE_DOWNLOAD_BYTES) return false;
	const head = bytes.subarray(0, 4096);
	let text: string;
	if (
		bytes.length >= 2 &&
		((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
	) {
		// UTF-16 with a BOM (Windows editors) — legitimate, decode for the sniff.
		text = new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(head.subarray(2));
	} else {
		for (const byte of head) if (byte === 0) return false; // binary
		text = new TextDecoder('latin1').decode(head).replace(BOM, '');
	}
	if (HTML_HEAD.test(text)) return false;
	switch (format) {
		case 'srt':
			return SRT_TIMING.test(text);
		case 'vtt':
			return /^\s*WEBVTT/.test(text) || VTT_TIMING.test(text);
		case 'ass':
		case 'ssa':
			return /\[script info\]|\[events\]/i.test(text);
		default:
			return false;
	}
}
