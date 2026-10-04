/**
 * Hub-wide branding (admin → Branding): the app's name, a login tagline, an
 * accent colour preset and the body/heading fonts. Client-safe (no DB, no
 * zod) so the admin form, its live preview, the root layout and the server
 * hook share one source for the options and the CSS they map to.
 */

export const APP_NAME_MAX = 32;
export const TAGLINE_MAX = 120;

export interface AccentColors {
	primary: string;
	primaryForeground: string;
}

export interface AccentPreset {
	value: string;
	label: string;
	/** Light theme: deep enough that `text-primary` keeps contrast on white. */
	light: AccentColors;
	/** Dark theme: bright enough for `text-primary` on the near-black page. */
	dark: AccentColors;
}

/** Hand-tuned oklch pairs; teal is the stock theme (layout.css), byte for byte. */
export const ACCENT_PRESETS = [
	accent('teal', 'Teal', 215, [0.55, 0.12], 210, [0.78, 0.12], 220),
	accent('blue', 'Blue', 255, [0.55, 0.17], 250, [0.76, 0.12]),
	accent('indigo', 'Indigo', 275, [0.51, 0.19], 275, [0.75, 0.12]),
	accent('violet', 'Violet', 295, [0.53, 0.2], 300, [0.77, 0.13]),
	accent('rose', 'Rose', 10, [0.56, 0.19], 10, [0.77, 0.13]),
	accent('orange', 'Orange', 45, [0.58, 0.16], 50, [0.78, 0.14]),
	accent('amber', 'Amber', 65, [0.58, 0.13], 75, [0.83, 0.14]),
	accent('green', 'Green', 150, [0.55, 0.14], 150, [0.79, 0.15])
] as const satisfies readonly AccentPreset[];

export type AccentId = (typeof ACCENT_PRESETS)[number]['value'];

function accent<V extends string>(
	value: V,
	label: string,
	lightHue: number,
	[lightL, lightC]: [number, number],
	darkHue: number,
	[darkL, darkC]: [number, number],
	darkForegroundHue = darkHue
): AccentPreset & { value: V } {
	return {
		value,
		label,
		light: {
			primary: `oklch(${lightL} ${lightC} ${lightHue})`,
			primaryForeground: `oklch(0.99 0.005 ${lightHue})`
		},
		dark: {
			primary: `oklch(${darkL} ${darkC} ${darkHue})`,
			primaryForeground: `oklch(0.15 0.03 ${darkForegroundHue})`
		}
	};
}

export interface FontOption {
	value: string;
	label: string;
	/** CSS font-family stack; the families are the `@fontsource-variable` imports in layout.css. */
	family: string;
	/** `sans` fonts can be the body font; `display` ones are headings only. */
	category: 'sans' | 'display';
}

/** Every family here must have its `@fontsource-variable/*` import in layout.css. */
export const FONTS = [
	font('figtree', 'Figtree', 'Figtree Variable'),
	font('inter', 'Inter', 'Inter Variable'),
	font('geist', 'Geist', 'Geist Variable'),
	font('manrope', 'Manrope', 'Manrope Variable'),
	font('dm-sans', 'DM Sans', 'DM Sans Variable'),
	font('plus-jakarta-sans', 'Plus Jakarta Sans', 'Plus Jakarta Sans Variable'),
	font('outfit', 'Outfit', 'Outfit Variable'),
	font('nunito', 'Nunito', 'Nunito Variable'),
	font('lexend', 'Lexend', 'Lexend Variable'),
	font('space-grotesk', 'Space Grotesk', 'Space Grotesk Variable'),
	font('sora', 'Sora', 'Sora Variable'),
	font('playfair-display', 'Playfair Display', 'Playfair Display Variable', 'display'),
	font('fraunces', 'Fraunces', 'Fraunces Variable', 'display'),
	font('cinzel', 'Cinzel', 'Cinzel Variable', 'display')
] as const satisfies readonly FontOption[];

export type FontId = (typeof FONTS)[number]['value'];

function font<V extends string>(
	value: V,
	label: string,
	family: string,
	category: FontOption['category'] = 'sans'
): FontOption & { value: V } {
	const fallback = category === 'display' ? 'serif' : 'sans-serif';
	return { value, label, family: `'${family}', ${fallback}`, category };
}

export const BODY_FONTS = FONTS.filter((f) => f.category === 'sans');
export const HEADING_FONTS = FONTS;

// Id lists for form validation (z.enum).
export const ACCENT_IDS = ACCENT_PRESETS.map((p) => p.value) as [AccentId, ...AccentId[]];
export const BODY_FONT_IDS = BODY_FONTS.map((f) => f.value) as [FontId, ...FontId[]];
export const HEADING_FONT_IDS = HEADING_FONTS.map((f) => f.value) as [FontId, ...FontId[]];

export interface Branding {
	appName: string;
	/** Shown under the name on the sign-in and sign-up pages; null = none. */
	tagline: string | null;
	accent: AccentId;
	bodyFont: FontId;
	headingFont: FontId;
}

export const DEFAULT_BRANDING: Branding = {
	appName: 'Finderella',
	tagline: null,
	accent: 'teal',
	bodyFont: 'figtree',
	headingFont: 'figtree'
};

export function accentPreset(id: string): AccentPreset {
	return ACCENT_PRESETS.find((p) => p.value === id) ?? ACCENT_PRESETS[0];
}

export function fontOption(id: string): FontOption {
	return FONTS.find((f) => f.value === id) ?? FONTS[0];
}

function oneOf<T extends string>(options: readonly { value: T }[], v: unknown, fallback: T): T {
	return options.find((o) => o.value === v)?.value ?? fallback;
}

function asText(v: unknown, max: number): string {
	return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Coerce anything (the settings row, a form) into valid branding, field by
 * field — an id from a preset or font that was since removed falls back to
 * the default instead of breaking the theme.
 */
export function normalizeBranding(
	input: Partial<Record<keyof Branding, unknown>> | null | undefined
): Branding {
	const d = DEFAULT_BRANDING;
	return {
		appName: asText(input?.appName, APP_NAME_MAX) || d.appName,
		tagline: asText(input?.tagline, TAGLINE_MAX) || null,
		accent: oneOf(ACCENT_PRESETS, input?.accent, d.accent),
		bodyFont: oneOf(BODY_FONTS, input?.bodyFont, d.bodyFont),
		headingFont: oneOf(HEADING_FONTS, input?.headingFont, d.headingFont)
	};
}

export type BrandVar =
	| '--primary'
	| '--primary-foreground'
	| '--ring'
	| '--sidebar-primary'
	| '--sidebar-primary-foreground'
	| '--sidebar-ring'
	| '--brand-font-body'
	| '--brand-font-heading';

/** The theme tokens a branding sets for one theme (layout.css reads them). */
export function brandStyleVars(
	branding: Pick<Branding, 'accent' | 'bodyFont' | 'headingFont'>,
	mode: 'light' | 'dark'
): Record<BrandVar, string> {
	const colors = accentPreset(branding.accent)[mode];
	return {
		'--primary': colors.primary,
		'--primary-foreground': colors.primaryForeground,
		'--ring': colors.primary,
		'--sidebar-primary': colors.primary,
		'--sidebar-primary-foreground': colors.primaryForeground,
		'--sidebar-ring': colors.primary,
		'--brand-font-body': fontOption(branding.bodyFont).family,
		'--brand-font-heading': fontOption(branding.headingFont).family
	};
}

function declarations(vars: Record<string, string>): string {
	return Object.entries(vars)
		.map(([name, value]) => `${name}:${value}`)
		.join(';');
}

/**
 * The stylesheet that applies a branding over layout.css's stock theme, or ''
 * for the defaults. Built only from the preset/font tables (never from admin
 * text), so it is safe to inline. The doubled selectors outrank layout.css's
 * `:root` / `.dark` whatever order the stylesheets load in (Vite appends its
 * dev styles after ours).
 */
export function brandStyleSheet(branding: Branding): string {
	const d = DEFAULT_BRANDING;
	if (
		branding.accent === d.accent &&
		branding.bodyFont === d.bodyFont &&
		branding.headingFont === d.headingFont
	) {
		return '';
	}
	return (
		`:root:root{${declarations(brandStyleVars(branding, 'light'))}}` +
		`:root.dark,:root .dark{${declarations(brandStyleVars(branding, 'dark'))}}`
	);
}

/** `<title>` text: "Movies · Finderella", or just the name when there's no page title. */
export function pageTitle(title: string | null | undefined, appName: string): string {
	return title ? `${title} · ${appName}` : appName;
}
