import type { SubtitleCandidate, SubtitleProviderId } from './providers/types';

export interface RankOptions {
	/** Video file basename — release names that share its structure rank first. */
	fileName: string;
	preferHearingImpaired: boolean;
	/** First = preferred. */
	providerOrder: SubtitleProviderId[];
}

/** The parts of a release name that decide timing: same group + source ≈ same cut. */
export interface ReleaseInfo {
	group?: string;
	source?: string;
	network?: string;
	resolution?: string;
	codec?: string;
	repack: boolean;
	tokens: Set<string>;
}

const SOURCE_ALIASES: Record<string, string> = {
	'web-dl': 'webdl',
	webdl: 'webdl',
	web: 'webdl',
	webrip: 'webrip',
	bluray: 'bluray',
	'blu-ray': 'bluray',
	bdrip: 'bluray',
	brrip: 'bluray',
	remux: 'remux',
	hdtv: 'hdtv',
	dvdrip: 'dvd',
	dvd: 'dvd',
	hdrip: 'hdrip',
	cam: 'cam',
	hdcam: 'cam',
	ts: 'ts',
	hdts: 'ts'
};
const NETWORKS = new Set([
	'amzn',
	'nf',
	'dsnp',
	'hulu',
	'atvp',
	'hmax',
	'max',
	'pcok',
	'pmtp',
	'stan',
	'itunes'
]);
const CODEC_ALIASES: Record<string, string> = {
	x264: 'h264',
	h264: 'h264',
	'h.264': 'h264',
	avc: 'h264',
	x265: 'h265',
	h265: 'h265',
	'h.265': 'h265',
	hevc: 'h265',
	av1: 'av1'
};
/** Tracker/site tags that trail release names but say nothing about the encode. */
const SITE_TAGS = new Set(['eztvx', 'eztv', 'tgx', 'rarbg', 'ettv', 'to', 'mx', 'ag', 'bz', 'gg']);
/** Bracketed tags that *are* the release group (YTS encodes are their own cut). */
const GROUP_TAGS: Record<string, string> = { yts: 'yts', yify: 'yts' };
const STOP_TOKENS = new Set(['the', 'a', 'and', 'of', 'to', 'in', 'srt', 'mkv', 'mp4', 'avi']);

function stripExtension(name: string): string {
	return name.replace(/\.[a-z0-9]{2,4}$/i, '');
}

/** Pull group/source/resolution/codec out of a release or file name. */
export function parseRelease(name: string): ReleaseInfo {
	let stem = stripExtension(name.trim());
	// `[EZTVx.to]` / `[TGx]` site tags are not release groups.
	const info: ReleaseInfo = { repack: false, tokens: new Set() };
	stem = stem.replace(/\[([^\]]+)\]/g, (match, inner: string) => {
		const key = inner.toLowerCase().split(/[.\s-]/)[0];
		if (GROUP_TAGS[key]) {
			info.group ??= GROUP_TAGS[key];
			return ' ';
		}
		return SITE_TAGS.has(key) ? ' ' : ` ${inner} `;
	});
	// Trailing `-GROUP` (before any site tag we just blanked).
	const group = /-([a-z0-9]+)\s*$/i.exec(stem.trimEnd());
	if (group && !SITE_TAGS.has(group[1].toLowerCase())) info.group = group[1].toLowerCase();
	// Keep compound tags whole (`WEB-DL`, `Blu-ray`, `H.264`) before splitting on everything else.
	const lower = stem
		.toLowerCase()
		.replace(/web-dl/g, 'webdl')
		.replace(/blu-ray/g, 'bluray')
		.replace(/\b([hx])\.(26[45])\b/g, '$1$2');
	for (const token of lower.split(/[^a-z0-9]+/)) {
		if (!token || STOP_TOKENS.has(token) || token === info.group) continue;
		if (GROUP_TAGS[token]) {
			info.group ??= GROUP_TAGS[token];
			continue;
		}
		if (!info.source && SOURCE_ALIASES[token]) info.source = SOURCE_ALIASES[token];
		else if (!info.network && NETWORKS.has(token)) info.network = token;
		else if (!info.resolution && /^(2160|1080|720|480)p$/.test(token)) info.resolution = token;
		else if (!info.codec && CODEC_ALIASES[token]) info.codec = CODEC_ALIASES[token];
		else if (token === 'repack' || token === 'proper') info.repack = true;
		else if (!SITE_TAGS.has(token)) info.tokens.add(token);
	}
	return info;
}

/** 0..1 — share of the file's leftover tokens the release name also carries. */
export function releaseOverlap(fileName: string, releaseName: string): number {
	const file = parseRelease(fileName).tokens;
	if (file.size === 0) return 0;
	const release = parseRelease(releaseName).tokens;
	let hits = 0;
	for (const token of file) if (release.has(token)) hits++;
	return hits / file.size;
}

export type MatchReason = 'hash' | 'release' | 'partial';

/** Why a candidate is believed to be in sync (shown in the player panel). */
export function matchReason(candidate: SubtitleCandidate, fileName: string): MatchReason | null {
	if (candidate.hashMatch) return 'hash';
	const file = parseRelease(fileName);
	const release = parseRelease(candidate.releaseName);
	if (file.group && file.group === release.group && file.source && file.source === release.source) {
		return 'release';
	}
	if (
		(file.group && file.group === release.group) ||
		(file.source && file.source === release.source)
	) {
		return 'partial';
	}
	return null;
}

/** Higher is better; hash > same release group + source > same source > popularity. */
export function scoreCandidate(candidate: SubtitleCandidate, opts: RankOptions): number {
	const providerIndex = opts.providerOrder.indexOf(candidate.provider);
	const providerRank =
		providerIndex === -1
			? 0
			: (opts.providerOrder.length - providerIndex) / opts.providerOrder.length;
	const file = parseRelease(opts.fileName);
	const release = parseRelease(candidate.releaseName);
	let score = 0;
	if (candidate.hashMatch) score += 8;
	if (file.group && file.group === release.group) score += 3;
	if (file.source && release.source) score += file.source === release.source ? 2 : -1.5;
	if (file.network && file.network === release.network) score += 1;
	if (file.resolution && file.resolution === release.resolution) score += 0.5;
	if (file.codec && file.codec === release.codec) score += 0.5;
	if (file.repack === release.repack && file.repack) score += 0.25;
	score += 1.5 * releaseOverlap(opts.fileName, candidate.releaseName);
	score += 2 * Number(candidate.trusted);
	score += 1.5 * providerRank;
	score += Math.min(3, Math.log10(candidate.downloads + 1)); // popularity can't outrank a release match
	score += candidate.rating / 10;
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
