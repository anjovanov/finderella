import { unzipSync } from 'fflate';
import { SUBTITLE_EXTENSIONS } from '@finderella/protocol';

const SUBTITLE_EXTENSION_SET = new Set<string>(SUBTITLE_EXTENSIONS);

export interface ZipSubtitleEntry {
	name: string;
	format: string;
	bytes: Uint8Array;
}

const ZIP_MAGIC = [0x50, 0x4b];

export function looksLikeZip(bytes: Uint8Array): boolean {
	return bytes.length > 4 && bytes[0] === ZIP_MAGIC[0] && bytes[1] === ZIP_MAGIC[1];
}

function extensionOf(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/** `S01E02`-style tag of a name, lowercased, or null. */
export function episodeTag(name: string): string | null {
	const match = /s(\d{1,2})\s*[._-]?\s*e(\d{1,3})/i.exec(name) ?? /(\d{1,2})x(\d{1,3})/i.exec(name);
	return match ? `s${Number(match[1])}e${Number(match[2])}` : null;
}

/**
 * Subtitle files inside an archive (only text formats the scanner accepts —
 * never VobSub `.sub/.idx`), skipping macOS junk and directories.
 */
export function listZipSubtitles(bytes: Uint8Array): ZipSubtitleEntry[] {
	const entries = unzipSync(bytes);
	const out: ZipSubtitleEntry[] = [];
	for (const [name, data] of Object.entries(entries)) {
		if (name.endsWith('/') || name.startsWith('__MACOSX/') || data.length === 0) continue;
		const ext = extensionOf(name);
		if (!SUBTITLE_EXTENSION_SET.has(ext)) continue;
		out.push({ name, format: ext.slice(1), bytes: data });
	}
	return out;
}

/** Titlovi archives often carry both scripts; entry names say which is which. */
export function isCyrillicEntryName(name: string): boolean {
	const lower = name.toLowerCase();
	return (
		(lower.includes('.cyr') || lower.includes('.cir') || lower.includes('cyr)')) &&
		!lower.includes('.lat')
	);
}

/**
 * The entry to keep: the one whose name carries the wanted episode tag (season
 * packs), else the largest — packs put the real subtitle beside tiny readmes.
 * `script` narrows to the Cyrillic or Latin entries first (when any match).
 */
export function pickZipSubtitle(
	entries: ZipSubtitleEntry[],
	wanted: { season?: number; episode?: number },
	opts: { script?: 'cyrillic' | 'latin' } = {}
): ZipSubtitleEntry | null {
	if (opts.script) {
		const narrowed = entries.filter((entry) =>
			opts.script === 'cyrillic'
				? isCyrillicEntryName(entry.name)
				: !isCyrillicEntryName(entry.name)
		);
		if (narrowed.length > 0) entries = narrowed;
	}
	if (entries.length === 0) return null;
	if (wanted.season !== undefined && wanted.episode !== undefined) {
		const tag = `s${wanted.season}e${wanted.episode}`;
		const match = entries.find((entry) => episodeTag(entry.name) === tag);
		if (match) return match;
	}
	return entries.reduce((best, entry) => (entry.bytes.length > best.bytes.length ? entry : best));
}
