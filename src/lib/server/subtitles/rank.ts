import type { SubtitleCandidate, SubtitleProviderId } from './providers/types';

export interface RankOptions {
	/** Video file basename — release names that share its tokens rank first. */
	fileName: string;
	preferHearingImpaired: boolean;
	/** First = preferred. */
	providerOrder: SubtitleProviderId[];
}

const STOP_TOKENS = new Set(['the', 'a', 'and', 'of', 'to', 'in', 'x264', 'x265', 'srt']);

/** Lowercase alphanumeric tokens of a release/file name, minus filler words. */
export function releaseTokens(name: string): Set<string> {
	const stem = name.replace(/\.[a-z0-9]{2,4}$/i, '');
	return new Set(
		stem
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length > 1 && !STOP_TOKENS.has(token))
	);
}

/** 0..1 — share of the file's tokens the release name also carries. */
export function releaseOverlap(fileName: string, releaseName: string): number {
	const file = releaseTokens(fileName);
	if (file.size === 0) return 0;
	const release = releaseTokens(releaseName);
	let hits = 0;
	for (const token of file) if (release.has(token)) hits++;
	return hits / file.size;
}

/** Higher is better; see the plan for the weights. */
export function scoreCandidate(candidate: SubtitleCandidate, opts: RankOptions): number {
	const providerIndex = opts.providerOrder.indexOf(candidate.provider);
	const providerRank =
		providerIndex === -1
			? 0
			: (opts.providerOrder.length - providerIndex) / opts.providerOrder.length;
	let score = 4 * releaseOverlap(opts.fileName, candidate.releaseName);
	score += 2 * Number(candidate.trusted);
	score += 1.5 * providerRank;
	score += Math.min(3, Math.log10(candidate.downloads + 1)); // popularity can't outrank a release match
	score += candidate.rating / 10;
	if (candidate.hashMatch) score += 6;
	if (candidate.hearingImpaired !== opts.preferHearingImpaired) score -= 3;
	if (candidate.machineTranslated) score -= 5;
	if (candidate.aiTranslated) score -= 2;
	if (candidate.forced) score -= 3;
	return score;
}

/** Best first. Stable for equal scores (keeps provider order). */
export function rankCandidates(
	candidates: SubtitleCandidate[],
	opts: RankOptions
): SubtitleCandidate[] {
	return candidates
		.map((candidate, index) => ({ candidate, index, score: scoreCandidate(candidate, opts) }))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(({ candidate }) => candidate);
}
