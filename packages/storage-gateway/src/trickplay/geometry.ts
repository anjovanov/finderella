import { createHash } from 'node:crypto';
import type { TrickplayGeometry } from '@finderella/protocol';

/**
 * Sprite-sheet layout (Jellyfin-like defaults): one 320 px-wide tile every
 * 10 s, 10×10 tiles per JPEG. Bump the version whenever any of these change —
 * it's part of the cache key, so old sheets are simply regenerated.
 */
export const TRICKPLAY_INTERVAL_S = 15;
export const TRICKPLAY_TILE_WIDTH = 400;
export const TRICKPLAY_COLUMNS = 10;
export const TRICKPLAY_ROWS = 10;
export const TRICKPLAY_GEOMETRY_VERSION = 2;

export interface TrickplaySource {
	width: number;
	height: number;
	/** ffprobe `sample_aspect_ratio`, e.g. `64:45`; unknown/`N/A` ignored. */
	sar?: string;
	/** ffprobe `display_aspect_ratio`, e.g. `16:9`; wins over sar when present. */
	dar?: string;
	/** Display-matrix rotation in degrees; ±90 swaps width and height. */
	rotation?: number;
}

/** `16:9` → [16, 9]; null for `N/A`, `0:1` and anything else unusable. */
export function parseRatio(text: string | undefined): [number, number] | null {
	const match = /^\s*(\d+):(\d+)\s*$/.exec(text ?? '');
	if (!match) return null;
	const a = Number(match[1]);
	const b = Number(match[2]);
	return a > 0 && b > 0 ? [a, b] : null;
}

/**
 * Width/height ratio as displayed. ffmpeg's `scale=W:-2` derives height from
 * the coded frame and would squash anamorphic (DVD) sources, so the tile
 * height is computed here from DAR, else SAR-adjusted coded size, else the
 * coded size alone. ffprobe reports ratios before rotation is applied.
 */
export function displayAspect(src: TrickplaySource): number {
	let aspect: number;
	const dar = parseRatio(src.dar);
	if (dar) {
		aspect = dar[0] / dar[1];
	} else {
		const sar = parseRatio(src.sar);
		const pixel = sar ? sar[0] / sar[1] : 1;
		aspect = src.width > 0 && src.height > 0 ? (src.width * pixel) / src.height : 16 / 9;
	}
	const quarterTurns = Math.round(Math.abs(src.rotation ?? 0) / 90) % 2;
	return quarterTurns === 1 ? 1 / aspect : aspect;
}

export function computeGeometry(src: TrickplaySource, durationMs: number): TrickplayGeometry {
	const rawHeight = TRICKPLAY_TILE_WIDTH / displayAspect(src);
	// yuv420p needs even dimensions.
	const tileHeight = Math.max(2, Math.round(rawHeight / 2) * 2);
	const tiles = durationMs > 0 ? Math.ceil(durationMs / 1000 / TRICKPLAY_INTERVAL_S) : 0;
	const sheets = Math.ceil(tiles / (TRICKPLAY_COLUMNS * TRICKPLAY_ROWS));
	return {
		version: TRICKPLAY_GEOMETRY_VERSION,
		interval: TRICKPLAY_INTERVAL_S,
		tileWidth: TRICKPLAY_TILE_WIDTH,
		tileHeight,
		columns: TRICKPLAY_COLUMNS,
		rows: TRICKPLAY_ROWS,
		tiles,
		sheets
	};
}

/** Cache key: file identity (path, size, mtime) plus the layout version — mirrors the subtitle cache. */
export function trickplayCacheKey(absPath: string, size: number, mtimeMs: number): string {
	return createHash('sha256')
		.update([absPath, size, Math.round(mtimeMs), `v${TRICKPLAY_GEOMETRY_VERSION}`].join('|'))
		.digest('hex');
}
