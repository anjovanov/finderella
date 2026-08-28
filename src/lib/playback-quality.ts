/**
 * Playback quality ladder + transcode planner, shared by the player menu
 * (client) and the start endpoint / playlist route (server). "original" is the
 * default: direct play when the file is browser-compatible, otherwise a
 * transcode at source resolution with no bitrate ceiling. Any
 * explicit rung forces an HLS transcode capped at that width and bitrate —
 * the knob for a gateway on a slow uplink, where an original-bitrate stream
 * would stall.
 */

export const QUALITY_IDS = ['original', '2160p', '1080p', '720p', '480p', '360p'] as const;
export type QualityId = (typeof QUALITY_IDS)[number];

export interface QualityRung {
	maxWidth: number;
	/** Video VBV cap (kbit/s). */
	maxVideoKbps: number;
	audioKbps: number;
}

export const QUALITY_LADDER: Record<Exclude<QualityId, 'original'>, QualityRung> = {
	'2160p': { maxWidth: 3840, maxVideoKbps: 20000, audioKbps: 192 },
	'1080p': { maxWidth: 1920, maxVideoKbps: 8000, audioKbps: 192 },
	'720p': { maxWidth: 1280, maxVideoKbps: 4000, audioKbps: 160 },
	'480p': { maxWidth: 854, maxVideoKbps: 2000, audioKbps: 128 },
	'360p': { maxWidth: 640, maxVideoKbps: 1000, audioKbps: 96 }
};

export const QUALITY_OPTIONS: { id: QualityId; label: string }[] = [
	{ id: 'original', label: 'Original' },
	{ id: '2160p', label: '2160p (4K)' },
	{ id: '1080p', label: '1080p' },
	{ id: '720p', label: '720p' },
	{ id: '480p', label: '480p' },
	{ id: '360p', label: '360p' }
];

/** Widest output the transcoder ever emits (4K UHD). */
export const MAX_TRANSCODE_WIDTH = 3840;

/** Cropped "1080p" files are often 1900-ish wide; treat ≥85% of a rung as that rung. */
const RUNG_TOLERANCE = 0.85;

export function isQualityId(value: unknown): value is QualityId {
	return typeof value === 'string' && (QUALITY_IDS as readonly string[]).includes(value);
}

/** Human label for a frame width ("1080p" for anything 1920-class). */
export function resolutionLabel(width: number): string {
	if (width >= 3840 * RUNG_TOLERANCE) return '2160p';
	if (width >= 1920 * RUNG_TOLERANCE) return '1080p';
	if (width >= 1280 * RUNG_TOLERANCE) return '720p';
	if (width >= 854 * RUNG_TOLERANCE) return '480p';
	return '360p';
}

/**
 * Menu entries for a given source: rungs above the file's own resolution
 * would only upscale (they don't — the scaler never enlarges) while still
 * forcing a transcode, so they're hidden. Unknown width → everything.
 */
export function availableQualities(
	sourceWidth: number | null | undefined
): { id: QualityId; label: string }[] {
	if (!sourceWidth) return QUALITY_OPTIONS;
	return QUALITY_OPTIONS.filter(
		(option) =>
			option.id === 'original' || QUALITY_LADDER[option.id].maxWidth * RUNG_TOLERANCE <= sourceWidth
	);
}

/** What the gateway is told to encode; also decides the master playlist's CODECS. */
export interface TranscodePlan {
	maxWidth: number;
	/** Absent = CRF only, no VBV ceiling (auto). */
	maxVideoKbps?: number;
	audioKbps: number;
	/** H.264 level: 4.1 covers up to 1080p; anything wider needs 5.2. */
	level: '4.1' | '5.2';
	/** RFC 6381 codec string matching profile/level, for the master playlist. */
	codec: 'avc1.640029' | 'avc1.640034';
}

export function transcodePlan(quality: QualityId, sourceWidth?: number | null): TranscodePlan {
	const rung = quality === 'original' ? undefined : QUALITY_LADDER[quality];
	const maxWidth = Math.min(MAX_TRANSCODE_WIDTH, rung?.maxWidth ?? MAX_TRANSCODE_WIDTH);
	const effectiveWidth = Math.min(maxWidth, sourceWidth || maxWidth);
	const uhd = effectiveWidth > 1920;
	return {
		maxWidth,
		maxVideoKbps: rung?.maxVideoKbps,
		audioKbps: rung?.audioKbps ?? 192,
		level: uhd ? '5.2' : '4.1',
		codec: uhd ? 'avc1.640034' : 'avc1.640029'
	};
}

const STORAGE_KEY = 'finderella:quality';

/** Remembered choice (browser only; defaults to original). */
export function loadStoredQuality(): QualityId {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		// 'auto' was this option's id before the rename; treat it as the default.
		return isQualityId(stored) ? stored : 'original';
	} catch {
		return 'original';
	}
}

export function storeQuality(quality: QualityId): void {
	try {
		localStorage.setItem(STORAGE_KEY, quality);
	} catch {
		// localStorage unavailable — the choice just isn't remembered.
	}
}
