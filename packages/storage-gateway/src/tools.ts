/**
 * Pure checks for whether an ffmpeg build can do everything the gateway asks
 * of it. Distro builds differ: Fedora's `ffmpeg-free` has no libx264,
 * Ubuntu 22.04's 4.4 lacks `-fps_mode`, and a build without libzimg has no
 * `zscale` — so "ffmpeg -version works" is not enough to prefer a system
 * build over the bundled one.
 */

/** Oldest release with every option the argv builders use (`-fps_mode` arrived in 5.1). */
export const MIN_FFMPEG_VERSION: readonly [number, number] = [5, 1];

/** Encoders HLS transcodes need (`hlsArgs`). */
export const REQUIRED_ENCODERS = ['libx264', 'aac'] as const;

/** Filters used by HLS scaling, trickplay sheets and dark-frame analysis. */
export const REQUIRED_FILTERS = [
	'scale',
	'fps',
	'tpad',
	'tile',
	'setsar',
	'extractplanes',
	'blackframe',
	'metadata'
] as const;

/** Filters `HDR_TONEMAP_FILTERS` needs; without them HDR sources play untone-mapped. */
export const HDR_FILTERS = ['zscale', 'tonemap'] as const;

export interface FfmpegAssessment {
	/** Every requirement met. */
	ok: boolean;
	/** Human-readable list of what's missing (`version 4.4 < 5.1`, `encoder libx264`, …). */
	missing: string[];
	/** `zscale` + `tonemap` present. */
	hdrTonemap: boolean;
}

/**
 * `[major, minor]` from an `ffmpeg version …` line, or null for builds that
 * don't carry a release number (git snapshots: `N-112345-g…`,
 * `2024-03-07-git-…`), which are newer than any release we require.
 */
export function parseFfmpegVersion(versionLine: string): [number, number] | null {
	const token = /version\s+(\S+)/.exec(versionLine)?.[1];
	if (!token) return null;
	const release = /^n?(\d+)\.(\d+)/.exec(token);
	return release ? [Number(release[1]), Number(release[2])] : null;
}

/**
 * Names from `ffmpeg -encoders` / `-filters` output. Both print one entry per
 * line as `<flags> <name> <description>`; legend lines (`V..... = Video`)
 * have `=` where the name would be.
 */
export function parseComponentList(stdout: string): Set<string> {
	const names = new Set<string>();
	for (const line of stdout.split(/\r?\n/)) {
		const match = /^\s*[A-Z.|]{2,6}\s+(\S+)/.exec(line);
		if (match && match[1] !== '=') names.add(match[1]);
	}
	return names;
}

export function assessFfmpeg(input: {
	versionLine: string;
	encoders: Set<string>;
	filters: Set<string>;
}): FfmpegAssessment {
	const missing: string[] = [];
	const version = parseFfmpegVersion(input.versionLine);
	const [minMajor, minMinor] = MIN_FFMPEG_VERSION;
	if (version && (version[0] < minMajor || (version[0] === minMajor && version[1] < minMinor))) {
		missing.push(`version ${version.join('.')} < ${MIN_FFMPEG_VERSION.join('.')}`);
	}
	for (const name of REQUIRED_ENCODERS) {
		if (!input.encoders.has(name)) missing.push(`encoder ${name}`);
	}
	for (const name of REQUIRED_FILTERS) {
		if (!input.filters.has(name)) missing.push(`filter ${name}`);
	}
	const hdrTonemap = HDR_FILTERS.every((name) => input.filters.has(name));
	return { ok: missing.length === 0, missing, hdrTonemap };
}

/** Rank candidates: fully capable first, then fewest missing pieces, then HDR support; ties keep order. */
export function pickBestCandidate<T extends { assessment: FfmpegAssessment }>(
	candidates: T[]
): T | null {
	let best: T | null = null;
	for (const candidate of candidates) {
		if (!best) {
			best = candidate;
			continue;
		}
		const a = candidate.assessment;
		const b = best.assessment;
		if (
			a.missing.length < b.missing.length ||
			(a.missing.length === b.missing.length && a.hdrTonemap && !b.hdrTonemap)
		) {
			best = candidate;
		}
	}
	return best;
}
