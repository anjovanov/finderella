/**
 * Per-viewer subtitle preferences: what the /settings page edits and the
 * player applies. Client-safe (no DB, no zod) so the player and the settings
 * form share one source for options, labels and the cue styling they map to.
 */

import { normalizeLanguage } from '@finderella/protocol/languages';

export const SUBTITLE_SIZES = ['small', 'medium', 'large', 'xlarge'] as const;
export type SubtitleSize = (typeof SUBTITLE_SIZES)[number];

/** Vertical position = whole cue lines above the bottom edge (0 = the edge). */
export const MAX_SUBTITLE_LINES = 12;

export const SUBTITLE_FONTS = ['sans', 'serif', 'mono', 'casual'] as const;
export type SubtitleFont = (typeof SUBTITLE_FONTS)[number];

export interface SubtitleSettings {
	/** 'off', or the ISO 639-1 language to turn on automatically. */
	language: string;
	size: SubtitleSize;
	/** `#rrggbb` */
	color: string;
	/** Dark box behind the text (the browser default) — off leaves text over the picture with a shadow. */
	background: boolean;
	/** 0..MAX_SUBTITLE_LINES lines above the bottom edge. */
	position: number;
	font: SubtitleFont;
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
	language: 'en',
	size: 'medium',
	color: '#ffffff',
	background: true,
	position: 2,
	font: 'sans'
};

export const SUBTITLE_SIZE_OPTIONS: { value: SubtitleSize; label: string }[] = [
	{ value: 'small', label: 'Small' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'large', label: 'Large' },
	{ value: 'xlarge', label: 'Extra large' }
];

export const SUBTITLE_COLOR_OPTIONS: { value: string; label: string }[] = [
	{ value: '#ffffff', label: 'White' },
	{ value: '#ffff00', label: 'Yellow' },
	{ value: '#00ffff', label: 'Cyan' },
	{ value: '#00ff00', label: 'Green' },
	{ value: '#ff00ff', label: 'Magenta' },
	{ value: '#ff4040', label: 'Red' },
	{ value: '#000000', label: 'Black' }
];

export const SUBTITLE_FONT_OPTIONS: { value: SubtitleFont; label: string }[] = [
	{ value: 'sans', label: 'Sans-serif' },
	{ value: 'serif', label: 'Serif' },
	{ value: 'mono', label: 'Monospace' },
	{ value: 'casual', label: 'Casual' }
];

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** ISO 639-1 codes the shared language table knows; `und` and typos fall back to the default. */
function asLanguage(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const code = value.trim().toLowerCase();
	if (code === 'off') return code;
	return normalizeLanguage(code) === code ? code : fallback;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
	return typeof value === 'string' && (values as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') return value;
	if (value === 'true' || value === '1' || value === 'on') return true;
	if (value === 'false' || value === '0' || value === 'off') return false;
	return fallback;
}

function asLines(value: unknown, fallback: number): number {
	const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isFinite(n)) return fallback;
	return Math.min(MAX_SUBTITLE_LINES, Math.max(0, Math.round(n)));
}

/** Coerce anything (a DB row, a form, JSON) into valid settings, defaulting field by field. */
export function normalizeSubtitleSettings(
	input: Partial<Record<keyof SubtitleSettings, unknown>> | null | undefined
): SubtitleSettings {
	const d = DEFAULT_SUBTITLE_SETTINGS;
	const color = typeof input?.color === 'string' ? input.color.trim().toLowerCase() : '';
	return {
		language: asLanguage(input?.language, d.language),
		size: oneOf(SUBTITLE_SIZES, input?.size, d.size),
		color: HEX_COLOR_RE.test(color) ? color : d.color,
		background: asBoolean(input?.background, d.background),
		position: asLines(input?.position, d.position),
		font: oneOf(SUBTITLE_FONTS, input?.font, d.font)
	};
}

/**
 * WebVTT `line` for a position: negative = lines counted up from the bottom
 * edge (-1 is the edge itself), so each step lifts the cue box by one line.
 */
export function cueLine(position: number): number {
	return -(asLines(position, DEFAULT_SUBTITLE_SETTINGS.position) + 1);
}

/** Slider caption: "Bottom edge", "1 line up", "5 lines up". */
export function positionLabel(position: number): string {
	const lines = asLines(position, DEFAULT_SUBTITLE_SETTINGS.position);
	if (lines === 0) return 'Bottom edge';
	return `${lines} ${lines === 1 ? 'line' : 'lines'} up`;
}

const FONT_STACKS: Record<SubtitleFont, string> = {
	sans: 'inherit',
	serif: "Georgia, 'Times New Roman', serif",
	mono: "ui-monospace, 'Cascadia Mono', 'Courier New', monospace",
	casual: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', casual, sans-serif"
};

/**
 * Cue font size as a percentage of the player's height. The player is a
 * full-viewport overlay, so `vh` is the player height whether windowed or
 * fullscreen; browsers' own default is about 5 % of the video height.
 * (Percentages on `::cue` resolve against a small inherited size in Chromium
 * and come out unreadable — never go back to them.)
 */
export const SIZE_SCALE: Record<SubtitleSize, number> = {
	small: 3,
	medium: 4,
	large: 5.2,
	xlarge: 6.8
};

/** Same box the browsers draw by default; without it, a shadow keeps text legible over bright frames. */
const CUE_BACKGROUND = 'rgb(0 0 0 / 0.8)';
const CUE_SHADOW = '0 1px 2px rgb(0 0 0 / 0.95), 0 0 6px rgb(0 0 0 / 0.7)';

/** CSS custom properties the player's `::cue` rule reads. */
export function cueStyleVars(settings: SubtitleSettings): Record<`--cue-${string}`, string> {
	return {
		'--cue-color': settings.color,
		'--cue-size': `${SIZE_SCALE[settings.size]}vh`,
		// The settings preview scales the same number by its own height (cqh).
		'--cue-size-pct': String(SIZE_SCALE[settings.size]),
		'--cue-font': FONT_STACKS[settings.font],
		'--cue-background': settings.background ? CUE_BACKGROUND : 'transparent',
		'--cue-shadow': settings.background ? 'none' : CUE_SHADOW
	};
}

/** Same mapping as an inline `style` string (for the settings preview and the player root). */
export function cueStyle(settings: SubtitleSettings): string {
	return Object.entries(cueStyleVars(settings))
		.map(([name, value]) => `${name}: ${value}`)
		.join('; ');
}
