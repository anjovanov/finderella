import { indices } from '../locales/plural.js';
import { isLocale, SOURCE_LOCALE } from '$lib/data/locale';

/**
 * Count-dependent text: `plural(n, ['One file', '# files'])`. wuchale extracts
 * the candidates as one plural entry (msgid / msgid_plural) and, at build time,
 * swaps in the catalog's forms for the viewer's language (CLDR rules, so a
 * language may have more than two) and passes that `locale`. `#` becomes `n`,
 * digit-grouped for the language.
 *
 * Replaces the generated `src/locales/plural.js` default (same name and
 * signature, which is what wuchale matches), whose `#` skips the grouping.
 */
export default function plural(n: number, candidates: string[], locale: string = SOURCE_LOCALE) {
	const lang = isLocale(locale) ? locale : SOURCE_LOCALE;
	const rule = indices.get(lang);
	const form = candidates[rule?.(n) ?? 0] ?? candidates.at(-1) ?? '';
	return form.replace('#', n.toLocaleString(lang));
}
