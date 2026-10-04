import { describe, expect, it } from 'vitest';
import {
	ACCENT_PRESETS,
	APP_NAME_MAX,
	BODY_FONTS,
	DEFAULT_BRANDING,
	FONTS,
	brandStyleSheet,
	brandStyleVars,
	normalizeBranding,
	pageTitle
} from './branding';

describe('normalizeBranding', () => {
	it('defaults everything for empty input', () => {
		expect(normalizeBranding(null)).toEqual(DEFAULT_BRANDING);
		expect(normalizeBranding({})).toEqual(DEFAULT_BRANDING);
	});

	it('trims and caps the name, and a blank one falls back', () => {
		expect(normalizeBranding({ appName: '  Cinema  ' }).appName).toBe('Cinema');
		expect(normalizeBranding({ appName: 'x'.repeat(50) }).appName).toHaveLength(APP_NAME_MAX);
		expect(normalizeBranding({ appName: '   ' }).appName).toBe('Finderella');
	});

	it('turns a blank tagline into null', () => {
		expect(normalizeBranding({ tagline: '  ' }).tagline).toBeNull();
		expect(normalizeBranding({ tagline: ' Movie night ' }).tagline).toBe('Movie night');
	});

	it('replaces unknown ids, and display fonts are headings only', () => {
		const b = normalizeBranding({
			accent: 'chartreuse',
			bodyFont: 'cinzel',
			headingFont: 'cinzel'
		});
		expect(b.accent).toBe('teal');
		expect(b.bodyFont).toBe('figtree');
		expect(b.headingFont).toBe('cinzel');
	});
});

describe('brandStyleSheet', () => {
	it('is empty for the stock theme', () => {
		expect(brandStyleSheet(DEFAULT_BRANDING)).toBe('');
		// The name and tagline never reach the CSS.
		expect(brandStyleSheet({ ...DEFAULT_BRANDING, appName: 'Cinema', tagline: 'Hi' })).toBe('');
	});

	it('sets the light and dark tokens of the preset and the fonts', () => {
		const css = brandStyleSheet({
			...DEFAULT_BRANDING,
			accent: 'violet',
			headingFont: 'playfair-display'
		});
		const violet = ACCENT_PRESETS.find((p) => p.value === 'violet')!;
		expect(css).toContain(`:root:root{--primary:${violet.light.primary};`);
		expect(css).toContain(`:root.dark,:root .dark{--primary:${violet.dark.primary};`);
		expect(css).toContain("--brand-font-heading:'Playfair Display Variable', serif");
		expect(css).toContain("--brand-font-body:'Figtree Variable', sans-serif");
	});
});

describe('tables', () => {
	it('keeps teal identical to the stock layout.css tokens', () => {
		expect(brandStyleVars(DEFAULT_BRANDING, 'light')['--primary']).toBe('oklch(0.55 0.12 215)');
		expect(brandStyleVars(DEFAULT_BRANDING, 'dark')['--primary']).toBe('oklch(0.78 0.12 210)');
		expect(brandStyleVars(DEFAULT_BRANDING, 'dark')['--primary-foreground']).toBe(
			'oklch(0.15 0.03 220)'
		);
	});

	it('has unique ids and complete entries', () => {
		expect(new Set(ACCENT_PRESETS.map((p) => p.value)).size).toBe(ACCENT_PRESETS.length);
		expect(new Set(FONTS.map((f) => f.value)).size).toBe(FONTS.length);
		for (const p of ACCENT_PRESETS) {
			for (const c of [p.light.primary, p.light.primaryForeground, p.dark.primary]) {
				expect(c).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
			}
		}
		expect(BODY_FONTS.every((f) => f.category === 'sans')).toBe(true);
	});
});

describe('pageTitle', () => {
	it('suffixes the app name', () => {
		expect(pageTitle('Movies', 'Cinema')).toBe('Movies · Cinema');
		expect(pageTitle(null, 'Cinema')).toBe('Cinema');
	});
});
