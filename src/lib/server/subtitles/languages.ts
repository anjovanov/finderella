/**
 * Our ISO 639-1 codes ↔ each provider's own codes. OpenSubtitles splits a
 * few languages by region (`pt-br`/`pt-pt`, `zh-cn`/`zh-tw`, Latin-American
 * Spanish `ea`); Subdl uses uppercase codes with its own spellings
 * (`BR_PT`, `ZH_BG` for traditional Chinese).
 */

const TO_OPENSUBTITLES: Record<string, string[]> = {
	pt: ['pt-br', 'pt-pt'],
	zh: ['zh-cn', 'zh-tw'],
	es: ['es', 'ea']
};
const FROM_OPENSUBTITLES: Record<string, string> = {
	'pt-br': 'pt',
	'pt-pt': 'pt',
	pm: 'pt',
	'zh-cn': 'zh',
	'zh-tw': 'zh',
	'zh-ca': 'zh',
	ze: 'zh',
	ea: 'es',
	sp: 'es'
};

const TO_SUBDL: Record<string, string[]> = {
	pt: ['PT', 'BR_PT'],
	zh: ['ZH', 'ZH_BG'],
	fa: ['FA'],
	tl: ['TL']
};
const FROM_SUBDL: Record<string, string> = {
	BR_PT: 'pt',
	ZH_BG: 'zh',
	FA: 'fa',
	TL: 'tl'
};

/** Gestdown resolves .NET culture names; regional languages need both variants. */
const TO_GESTDOWN: Record<string, string[]> = {
	pt: ['pt-BR', 'pt'],
	zh: ['zh-CN', 'zh-TW'],
	no: ['nb', 'no']
};

/** Gestdown `{language}` path values for one of our codes. */
export function toGestdown(code: string): string[] {
	return TO_GESTDOWN[code] ?? [code];
}

/** OpenSubtitles `languages` values for one of our codes (lowercase). */
export function toOpenSubtitles(code: string): string[] {
	return TO_OPENSUBTITLES[code] ?? [code];
}

/** Our code for an OpenSubtitles language, or undefined when it isn't one we list. */
export function fromOpenSubtitles(code: string | null | undefined): string | undefined {
	if (!code) return undefined;
	const lower = code.toLowerCase();
	return FROM_OPENSUBTITLES[lower] ?? (/^[a-z]{2}$/.test(lower) ? lower : undefined);
}

/** Subdl `languages` values for one of our codes (uppercase). */
export function toSubdl(code: string): string[] {
	return TO_SUBDL[code] ?? [code.toUpperCase()];
}

/** Our code for a Subdl language code (`EN`, `BR_PT`), or undefined. */
export function fromSubdl(code: string | null | undefined): string | undefined {
	if (!code) return undefined;
	const upper = code.toUpperCase();
	if (FROM_SUBDL[upper]) return FROM_SUBDL[upper];
	return /^[A-Z]{2}$/.test(upper) ? upper.toLowerCase() : undefined;
}
