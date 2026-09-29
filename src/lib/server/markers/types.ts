import type { MarkerKind } from '$lib/data/markers';

export type MarkerSource = 'chapter' | 'fingerprint' | 'darkframes';

/** A detected marker in source milliseconds, before it's stored as a `media_marker` row. */
export interface DetectedMarker {
	kind: MarkerKind;
	source: MarkerSource;
	startMs: number;
	endMs: number;
	/** 0..1 — chapter markers are 1, fingerprint support ratio, dark frames 0.5. */
	confidence: number;
}

/** Bump when detection (compare/season/darkframes/chapter rules) changes: files below it are re-analysed. */
export const MARKERS_VERSION = 1;
