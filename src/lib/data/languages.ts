/**
 * Media languages (audio / subtitle tracks, subtitle searches) named in the
 * viewer's UI language. The protocol's table (`@finderella/protocol/languages`)
 * holds the ISO 639-1 codes and English names the gateway parses; the names
 * shown in the UI come from `Intl.DisplayNames`, with the English name as the
 * fallback for a code the runtime doesn't know.
 */
import { LANGUAGES, languageName } from '@finderella/protocol/languages';
import { currentLocale } from './locale';

// One formatter per UI language: building one per call made each language
// list construct ~50 of them.
const displayNames = new Map<string, Intl.DisplayNames>();
function namesFor(locale: string): Intl.DisplayNames {
	let names = displayNames.get(locale);
	if (!names) {
		names = new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' });
		displayNames.set(locale, names);
	}
	return names;
}

/** "Spanish" / "Español" for 'es'; undefined for an unknown code. */
export function languageLabel(code: string | null | undefined): string | undefined {
	const english = languageName(code);
	if (!code || !english) return english;
	const locale = currentLocale();
	try {
		const name = namesFor(locale).of(code);
		// Spanish and others lower-case language names mid-sentence; these stand alone.
		if (name) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
	} catch {
		// An unsupported code: the English name below.
	}
	return english;
}

/** Every known language as select options, sorted by name in the UI language. */
export function languageOptions(): { code: string; name: string }[] {
	const locale = currentLocale();
	return LANGUAGES.map(({ code, name }) => ({ code, name: languageLabel(code) ?? name })).toSorted(
		(a, b) => a.name.localeCompare(b.name, locale)
	);
}
