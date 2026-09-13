import { isUtf8 } from 'node:buffer';

/**
 * Providers other than OpenSubtitles hand out files in legacy code pages
 * without saying so (Titlovi: windows-1250/1251, Gestdown: Latin-1). The
 * language is the best hint for which one; valid UTF-8 is kept as is.
 */
const CODE_PAGE_BY_LANGUAGE: Record<string, string> = {
	hr: 'windows-1250',
	bs: 'windows-1250',
	sl: 'windows-1250',
	sr: 'windows-1250',
	cs: 'windows-1250',
	sk: 'windows-1250',
	pl: 'windows-1250',
	hu: 'windows-1250',
	ro: 'windows-1250',
	mk: 'windows-1251',
	ru: 'windows-1251',
	uk: 'windows-1251',
	bg: 'windows-1251',
	el: 'windows-1253',
	tr: 'windows-1254',
	he: 'windows-1255',
	ar: 'windows-1256',
	lt: 'windows-1257',
	lv: 'windows-1257',
	et: 'windows-1257',
	vi: 'windows-1258',
	th: 'windows-874'
};

/** Code page to assume for a language (and script) when a file isn't UTF-8. */
export function legacyCodePage(language: string, script?: 'cyrillic'): string {
	if (script === 'cyrillic') return 'windows-1251';
	return CODE_PAGE_BY_LANGUAGE[language] ?? 'windows-1252';
}

/** Re-encode a subtitle file to UTF-8 (BOM-less), guessing the legacy code page from the language. */
export function normalizeSubtitleEncoding(
	bytes: Uint8Array,
	language: string,
	script?: 'cyrillic'
): Uint8Array {
	if (
		bytes.length >= 2 &&
		((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
	) {
		const text = new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(
			bytes.subarray(2)
		);
		return new TextEncoder().encode(text);
	}
	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		return bytes.subarray(3);
	}
	if (isUtf8(bytes)) return bytes;
	const text = new TextDecoder(legacyCodePage(language, script)).decode(bytes);
	return new TextEncoder().encode(text);
}
