import { describe, expect, it } from 'vitest';
import {
	computeGeometry,
	displayAspect,
	parseRatio,
	trickplayCacheKey,
	TRICKPLAY_GEOMETRY_VERSION
} from './geometry.js';

describe('parseRatio', () => {
	it('parses W:H and rejects unusable values', () => {
		expect(parseRatio('16:9')).toEqual([16, 9]);
		expect(parseRatio(' 64:45 ')).toEqual([64, 45]);
		expect(parseRatio('N/A')).toBeNull();
		expect(parseRatio('0:1')).toBeNull();
		expect(parseRatio(undefined)).toBeNull();
	});
});

describe('displayAspect', () => {
	it('prefers DAR, then SAR-adjusted coded size, then coded size', () => {
		expect(displayAspect({ width: 720, height: 576, dar: '16:9' })).toBeCloseTo(16 / 9);
		expect(displayAspect({ width: 720, height: 576, sar: '64:45' })).toBeCloseTo(16 / 9);
		expect(displayAspect({ width: 1920, height: 1080, sar: 'N/A' })).toBeCloseTo(16 / 9);
	});

	it('swaps the aspect for ±90° rotation', () => {
		expect(displayAspect({ width: 1920, height: 1080, rotation: -90 })).toBeCloseTo(9 / 16);
		expect(displayAspect({ width: 1920, height: 1080, rotation: 180 })).toBeCloseTo(16 / 9);
	});
});

describe('computeGeometry', () => {
	it('derives an even tile height from the display aspect', () => {
		expect(computeGeometry({ width: 1920, height: 1080 }, 60_000).tileHeight).toBe(226);
		expect(computeGeometry({ width: 3840, height: 1600 }, 60_000).tileHeight).toBe(166);
		expect(computeGeometry({ width: 720, height: 576, dar: '16:9' }, 60_000).tileHeight).toBe(226);
		expect(computeGeometry({ width: 720, height: 576 }, 60_000).tileHeight).toBe(320);
	});

	it('counts tiles and sheets from the duration', () => {
		const at = (seconds: number) => computeGeometry({ width: 1920, height: 1080 }, seconds * 1000);
		expect(at(0)).toMatchObject({ tiles: 0, sheets: 0 });
		expect(at(1490)).toMatchObject({ tiles: 100, sheets: 1 });
		expect(at(1501)).toMatchObject({ tiles: 101, sheets: 2 });
		expect(at(7200)).toMatchObject({ tiles: 480, sheets: 5 });
		expect(at(7200)).toMatchObject({
			version: TRICKPLAY_GEOMETRY_VERSION,
			interval: 15,
			tileWidth: 400,
			columns: 10,
			rows: 10
		});
	});
});

describe('trickplayCacheKey', () => {
	it('changes with the file identity and rounds fractional mtimes', () => {
		const base = trickplayCacheKey('/m/a.mkv', 100, 1000);
		expect(base).toHaveLength(64);
		expect(trickplayCacheKey('/m/a.mkv', 100, 1000.4)).toBe(base);
		expect(trickplayCacheKey('/m/a.mkv', 101, 1000)).not.toBe(base);
		expect(trickplayCacheKey('/m/a.mkv', 100, 2000)).not.toBe(base);
		expect(trickplayCacheKey('/m/b.mkv', 100, 1000)).not.toBe(base);
	});
});
