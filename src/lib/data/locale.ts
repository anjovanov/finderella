/**
 * UI language (wuchale catalogs). Client-safe, so the server hook
 * (`runWithLocale`), the root universal load (`loadLocale`) and the settings
 * pages share one list. `src/locales/data.js` is generated from
 * `wuchale.config.js`'s `locales`.
 *
 * A profile's language is stored as a locale or null ("the hub's default"); the
 * hub's default lives in `site_settings.default_language`.
 */
import { locales, type Locale } from '../../locales/data.js';

export type { Locale };
export const LOCALES = locales;

/** The language the code is written in, and the hub's default until an admin changes it. */
export const SOURCE_LOCALE: Locale = 'en';

/** Each language in its own name (endonym): a viewer must recognise theirs in any UI language. */
const ENDONYMS: Record<Locale, string> = {
	en: 'English',
	es: 'Español'
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** A stored or posted locale if the app has a catalog for it, else `fallback`. */
export function pickLocale(value: unknown, fallback: Locale = SOURCE_LOCALE): Locale {
	return isLocale(value) ? value : fallback;
}

/** The UI language for a request: the profile's pick, else the hub's default. */
export function resolveLocale(profileLanguage: unknown, siteDefault: unknown): Locale {
	return pickLocale(profileLanguage, pickLocale(siteDefault));
}

export function localeName(locale: Locale): string {
	return ENDONYMS[locale];
}

/**
 * The viewer's UI language, for `Intl` formatters. Call it bare: wuchale's
 * `currentLocale` pattern (wuchale.config.js) rewrites `currentLocale()` into
 * `currentLocale(<the caller's catalog locale>)` in every file it compiles
 * (components, route files, `src/lib` helpers), so it is the request's locale
 * on the server and follows a language switch on the client. Code wuchale
 * doesn't compile (server-only modules, tests) gets the source language.
 */
export function currentLocale(locale: string = SOURCE_LOCALE): Locale {
	return pickLocale(locale);
}
