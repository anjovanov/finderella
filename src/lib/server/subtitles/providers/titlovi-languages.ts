/**
 * Titlovi speaks display names, not codes, and lists Serbian Cyrillic as its
 * own language. Pure so it's tested.
 */
export const TITLOVI_LANGUAGES: { code: string; name: string; script?: 'cyrillic' }[] = [
	{ code: 'bs', name: 'Bosanski' },
	{ code: 'hr', name: 'Hrvatski' },
	{ code: 'sr', name: 'Srpski' },
	{ code: 'sr', name: 'Cirilica', script: 'cyrillic' },
	{ code: 'sl', name: 'Slovenski' },
	{ code: 'mk', name: 'Makedonski' },
	{ code: 'en', name: 'English' }
];

export function titloviSupports(code: string): boolean {
	return TITLOVI_LANGUAGES.some((entry) => entry.code === code);
}

/** The `lang` parameter for one of our codes (`sr` → `Srpski|Cirilica`). */
export function toTitloviLang(code: string): string {
	return TITLOVI_LANGUAGES.filter((entry) => entry.code === code)
		.map((entry) => entry.name)
		.join('|');
}

/** Our code (and script) for a Titlovi `Lang` value. */
export function fromTitloviLang(
	name: string | null | undefined
): { code: string; script?: 'cyrillic' } | null {
	if (!name) return null;
	const entry = TITLOVI_LANGUAGES.find((e) => e.name.toLowerCase() === name.trim().toLowerCase());
	return entry ? { code: entry.code, script: entry.script } : null;
}
