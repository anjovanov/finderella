import { describe, expect, it } from 'vitest';
import {
	cueLine,
	cueStyle,
	DEFAULT_SUBTITLE_SETTINGS,
	normalizeSubtitleSettings,
	positionLabel
} from './subtitle-settings';

describe('normalizeSubtitleSettings', () => {
	it('fills defaults for missing or invalid fields and keeps valid ones', () => {
		expect(normalizeSubtitleSettings(null)).toEqual(DEFAULT_SUBTITLE_SETTINGS);
		expect(
			normalizeSubtitleSettings({
				language: 'OFF',
				size: 'huge',
				color: '#FFFF00',
				background: 'false',
				position: '7',
				font: 'wingdings'
			})
		).toEqual({
			language: 'off',
			size: 'medium',
			color: '#ffff00',
			background: false,
			position: 7,
			font: 'sans'
		});
		expect(normalizeSubtitleSettings({ position: 99 }).position).toBe(12);
		expect(normalizeSubtitleSettings({ position: -3 }).position).toBe(0);
		expect(normalizeSubtitleSettings({ position: 'up' }).position).toBe(2);
		expect(normalizeSubtitleSettings({ background: 'maybe' }).background).toBe(true);
		expect(normalizeSubtitleSettings({ language: 'fr' }).language).toBe('fr');
		// Only codes the language table knows; names, 639-2 codes and `und` fall back.
		expect(normalizeSubtitleSettings({ language: 'english' }).language).toBe('en');
		expect(normalizeSubtitleSettings({ language: 'und' }).language).toBe('en');
		expect(normalizeSubtitleSettings({ language: 'eng' }).language).toBe('en');
		expect(normalizeSubtitleSettings({ language: 'zz' }).language).toBe('en');
		expect(normalizeSubtitleSettings({ color: 'red' }).color).toBe('#ffffff');
	});
});

describe('cueLine / cueStyle', () => {
	it('maps positions to lines from the bottom and settings to cue variables', () => {
		expect(cueLine(0)).toBe(-1);
		expect(cueLine(2)).toBe(-3);
		expect(cueLine(40)).toBe(-13);
		expect(positionLabel(0)).toBe('Bottom edge');
		expect(positionLabel(1)).toBe('1 line up');
		expect(positionLabel(5)).toBe('5 lines up');
		const boxed = cueStyle({ ...DEFAULT_SUBTITLE_SETTINGS, size: 'large', color: '#00ffff' });
		expect(boxed).toContain('--cue-color: #00ffff');
		expect(boxed).toContain('--cue-size: 5.2vh');
		expect(boxed).toContain('--cue-size-pct: 5.2');
		expect(boxed).toContain('--cue-background: rgb(0 0 0 / 0.8)');
		expect(boxed).toContain('--cue-shadow: none');
		const bare = cueStyle({ ...DEFAULT_SUBTITLE_SETTINGS, background: false });
		expect(bare).toContain('--cue-background: transparent');
		expect(bare).toContain('--cue-shadow: 0 1px 2px');
	});
});
