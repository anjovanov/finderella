import { createHash } from 'node:crypto';
import {
	MARKERS_MAX_DARKFRAMES_MS,
	MARKERS_MAX_REGION_MS,
	type MarkersAnalyzeMessage,
	type MarkersRegion,
	type MarkersWindow
} from '@finderella/protocol';
import { FINGERPRINT_VERSION } from './fingerprint.js';

/** Total audio a single request may make the device decode. */
const MAX_TOTAL_AUDIO_MS = 20 * 60_000;

export interface MarkersSpec {
	audioStreamIndex?: number;
	regions: MarkersRegion[];
	darkframes?: MarkersWindow;
}

/** What the device will actually compute for a request (clamped; stable key order). */
export function normalizeSpec(
	message: Pick<MarkersAnalyzeMessage, 'audioStreamIndex' | 'regions' | 'darkframes'>
): MarkersSpec {
	const regions: MarkersRegion[] = [];
	let budget = MAX_TOTAL_AUDIO_MS;
	for (const region of message.regions.slice(0, 2)) {
		const durationMs = Math.min(region.durationMs, MARKERS_MAX_REGION_MS, budget);
		if (durationMs <= 0) break;
		regions.push({ kind: region.kind, startMs: region.startMs, durationMs });
		budget -= durationMs;
	}
	const spec: MarkersSpec = { regions };
	if (regions.length > 0 && message.audioStreamIndex !== undefined) {
		spec.audioStreamIndex = message.audioStreamIndex;
	}
	if (message.darkframes) {
		spec.darkframes = {
			startMs: message.darkframes.startMs,
			durationMs: Math.min(message.darkframes.durationMs, MARKERS_MAX_DARKFRAMES_MS)
		};
	}
	return spec;
}

/** Cache key: file identity, algorithm version and the exact request. */
export function markersCacheKey(
	absPath: string,
	size: number,
	mtimeMs: number,
	spec: MarkersSpec
): string {
	return createHash('sha256')
		.update(
			[
				absPath,
				size,
				Math.round(mtimeMs),
				`v${FINGERPRINT_VERSION}`,
				JSON.stringify([
					spec.audioStreamIndex ?? null,
					spec.regions.map((r) => [r.kind, r.startMs, r.durationMs]),
					spec.darkframes ? [spec.darkframes.startMs, spec.darkframes.durationMs] : null
				])
			].join('|')
		)
		.digest('hex');
}
