import type { MarkersRegion, MarkersWindow } from '@finderella/protocol';

/**
 * Which parts of a file the device analyses. Series: the opening (intros sit
 * after cold opens of up to several minutes) and the ending, both
 * fingerprinted for comparison with the other episodes, plus dark frames
 * over the ending as the credits fallback. Movies: dark frames over the
 * ending only — nothing to compare them with.
 */
export interface AnalysisSpec {
	regions: MarkersRegion[];
	darkframes?: MarkersWindow;
}

const MIN = 60_000;
/** Shorter files (clips, extras) aren't worth analysing. */
export const MIN_ANALYSIS_DURATION_MS = 5 * MIN;

export function analysisSpec(kind: 'movie' | 'series', durationMs: number): AnalysisSpec | null {
	if (!Number.isFinite(durationMs) || durationMs < MIN_ANALYSIS_DURATION_MS) return null;
	const duration = Math.floor(durationMs);
	if (kind === 'movie') {
		const length = Math.round(Math.min(15 * MIN, duration * 0.2));
		return { regions: [], darkframes: { startMs: duration - length, durationMs: length } };
	}
	const introLength = Math.round(Math.min(10 * MIN, duration * 0.3));
	const creditsLength = Math.round(Math.min(6 * MIN, duration * 0.25));
	const creditsStart = duration - creditsLength;
	return {
		regions: [
			{ kind: 'intro', startMs: 0, durationMs: introLength },
			{ kind: 'credits', startMs: creditsStart, durationMs: creditsLength }
		],
		darkframes: { startMs: creditsStart, durationMs: creditsLength }
	};
}

export interface AnalysisAudioCandidate {
	streamIndex: number;
	isDefault: boolean;
	commentary: boolean;
	descriptive: boolean;
}

/**
 * The audio stream to fingerprint: the default-flagged main track, else the
 * first main track, else the first. Theme music is usually the same across
 * dubs, but mixing languages between episodes would still hurt matching —
 * the default is what's most consistent across a season.
 */
export function pickAnalysisAudio(tracks: readonly AnalysisAudioCandidate[]): number | undefined {
	const main = tracks.filter((t) => !t.commentary && !t.descriptive);
	return (main.find((t) => t.isDefault) ?? main[0] ?? tracks[0])?.streamIndex;
}
