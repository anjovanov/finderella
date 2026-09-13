/**
 * Language table shared by the gateway (which parses ffprobe tags and
 * subtitle filenames) and the hub (which labels tracks in the player).
 * Codes are ISO 639-1; `aliases` hold the 639-2/B + 639-2/T codes and the
 * English (plus a few native) names that show up in release filenames.
 */
export interface LanguageEntry {
	code: string;
	name: string;
	aliases: readonly string[];
}

export const LANGUAGES: readonly LanguageEntry[] = [
	{ code: 'en', name: 'English', aliases: ['eng', 'english'] },
	{
		code: 'es',
		name: 'Spanish',
		aliases: ['spa', 'spanish', 'espanol', 'español', 'castellano', 'latino']
	},
	{ code: 'fr', name: 'French', aliases: ['fre', 'fra', 'french', 'francais', 'français'] },
	{ code: 'de', name: 'German', aliases: ['ger', 'deu', 'german', 'deutsch'] },
	{ code: 'it', name: 'Italian', aliases: ['ita', 'italian', 'italiano'] },
	{
		code: 'pt',
		name: 'Portuguese',
		aliases: ['por', 'portuguese', 'portugues', 'português', 'brazilian']
	},
	{ code: 'nl', name: 'Dutch', aliases: ['dut', 'nld', 'dutch', 'nederlands'] },
	{ code: 'sv', name: 'Swedish', aliases: ['swe', 'swedish', 'svenska'] },
	{ code: 'no', name: 'Norwegian', aliases: ['nor', 'nob', 'nno', 'norwegian', 'norsk'] },
	{ code: 'da', name: 'Danish', aliases: ['dan', 'danish', 'dansk'] },
	{ code: 'fi', name: 'Finnish', aliases: ['fin', 'finnish', 'suomi'] },
	{ code: 'is', name: 'Icelandic', aliases: ['ice', 'isl', 'icelandic'] },
	{ code: 'pl', name: 'Polish', aliases: ['pol', 'polish', 'polski'] },
	{ code: 'cs', name: 'Czech', aliases: ['cze', 'ces', 'czech'] },
	{ code: 'sk', name: 'Slovak', aliases: ['slo', 'slk', 'slovak'] },
	{ code: 'hu', name: 'Hungarian', aliases: ['hun', 'hungarian', 'magyar'] },
	{ code: 'ro', name: 'Romanian', aliases: ['rum', 'ron', 'romanian'] },
	{ code: 'bg', name: 'Bulgarian', aliases: ['bul', 'bulgarian'] },
	{ code: 'el', name: 'Greek', aliases: ['gre', 'ell', 'greek'] },
	{ code: 'tr', name: 'Turkish', aliases: ['tur', 'turkish', 'turkce', 'türkçe'] },
	{ code: 'ru', name: 'Russian', aliases: ['rus', 'russian'] },
	{ code: 'uk', name: 'Ukrainian', aliases: ['ukr', 'ukrainian'] },
	{ code: 'sr', name: 'Serbian', aliases: ['srp', 'scc', 'serbian'] },
	{ code: 'hr', name: 'Croatian', aliases: ['hrv', 'scr', 'croatian'] },
	{ code: 'sl', name: 'Slovenian', aliases: ['slv', 'slovenian', 'slovene'] },
	{ code: 'lt', name: 'Lithuanian', aliases: ['lit', 'lithuanian'] },
	{ code: 'lv', name: 'Latvian', aliases: ['lav', 'latvian'] },
	{ code: 'et', name: 'Estonian', aliases: ['est', 'estonian'] },
	{ code: 'he', name: 'Hebrew', aliases: ['heb', 'hebrew'] },
	{ code: 'ar', name: 'Arabic', aliases: ['ara', 'arabic'] },
	{ code: 'fa', name: 'Persian', aliases: ['per', 'fas', 'persian', 'farsi'] },
	{ code: 'hi', name: 'Hindi', aliases: ['hin', 'hindi'] },
	{ code: 'bn', name: 'Bengali', aliases: ['ben', 'bengali', 'bangla'] },
	{ code: 'mr', name: 'Marathi', aliases: ['mar', 'marathi'] },
	{ code: 'gu', name: 'Gujarati', aliases: ['guj', 'gujarati'] },
	{ code: 'pa', name: 'Punjabi', aliases: ['pan', 'punjabi'] },
	{ code: 'ur', name: 'Urdu', aliases: ['urd', 'urdu'] },
	{ code: 'ta', name: 'Tamil', aliases: ['tam', 'tamil'] },
	{ code: 'te', name: 'Telugu', aliases: ['tel', 'telugu'] },
	{ code: 'kn', name: 'Kannada', aliases: ['kan', 'kannada'] },
	{ code: 'ml', name: 'Malayalam', aliases: ['mal', 'malayalam'] },
	{ code: 'th', name: 'Thai', aliases: ['tha', 'thai'] },
	{ code: 'vi', name: 'Vietnamese', aliases: ['vie', 'vietnamese'] },
	{ code: 'id', name: 'Indonesian', aliases: ['ind', 'indonesian'] },
	{ code: 'ms', name: 'Malay', aliases: ['may', 'msa', 'malay'] },
	{ code: 'tl', name: 'Filipino', aliases: ['tgl', 'fil', 'filipino', 'tagalog'] },
	{
		code: 'zh',
		name: 'Chinese',
		aliases: ['chi', 'zho', 'chinese', 'mandarin', 'cantonese', 'chs', 'cht']
	},
	{ code: 'ja', name: 'Japanese', aliases: ['jpn', 'japanese'] },
	{ code: 'ko', name: 'Korean', aliases: ['kor', 'korean'] }
];

const BY_TOKEN = new Map<string, string>();
for (const entry of LANGUAGES) {
	BY_TOKEN.set(entry.code, entry.code);
	for (const alias of entry.aliases) BY_TOKEN.set(alias, entry.code);
}
const BY_CODE = new Map(LANGUAGES.map((entry) => [entry.code, entry.name]));

/**
 * ISO 639-1 code for a language token from an ffprobe tag (`eng`, `en-US`)
 * or a filename (`English`), or undefined when unknown. `und` is unknown.
 */
export function normalizeLanguage(token: string | undefined | null): string | undefined {
	if (!token) return undefined;
	const lower = token.trim().toLowerCase();
	if (!lower) return undefined;
	const direct = BY_TOKEN.get(lower);
	if (direct) return direct;
	// Region-tagged (`en-US`, `pt_BR`, `zh-Hans`): the primary subtag decides.
	const primary = lower.split(/[-_]/)[0];
	return primary === lower ? undefined : BY_TOKEN.get(primary);
}

/** English display name for a normalized code ("English"), or undefined. */
export function languageName(code: string | undefined | null): string | undefined {
	return code ? BY_CODE.get(code) : undefined;
}
