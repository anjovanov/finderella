import type { MarkerKind } from '$lib/data/markers';
import { compareFingerprints, type SharedSegment } from './compare';
import type { DetectedMarker } from './types';

/**
 * Season-wide intro/credits detection: each episode is compared with a few
 * others (nearest episode numbers first) and a stretch counts when enough
 * partners share it. Requiring two partners rejects what only one pair has
 * in common — a recap of the previous episode, a reused scene — while the
 * theme every episode plays survives.
 */

export interface FingerprintRegion {
	/** Where the fingerprint starts in the file (ms). */
	startMs: number;
	fingerprint: Uint32Array;
}

export interface SeasonFile {
	/** media_file id. */
	id: string;
	/** Copies of the same episode are never compared with each other. */
	episodeId: string;
	seasonNumber: number;
	episodeNumber: number;
	durationMs: number;
	/** Gateway fingerprint version — only equal versions are comparable. */
	version: number;
	hopMs: number;
	intro?: FingerprintRegion;
	credits?: FingerprintRegion;
}

interface KindRules {
	minMs: number;
	maxMs: number;
	/** Earliest start as a fraction of the file's duration. */
	minStartFraction: number;
}

const RULES: Record<MarkerKind, KindRules> = {
	intro: { minMs: 15_000, maxMs: 150_000, minStartFraction: 0 },
	credits: { minMs: 15_000, maxMs: 10 * 60_000, minStartFraction: 0.5 }
};

export const MAX_PARTNERS = 4;
/** With a single partner the match must be longer and cleaner to count. */
const SINGLE_PARTNER_MIN_MS = 20_000;
const SINGLE_PARTNER_MAX_BER = 0.25;
/** Coverage gaps bridged when merging partner segments. */
const MERGE_GAP_MS = 1000;

/** Comparison partners for `file`, nearest first (same season, then adjacent seasons). */
export function pickPartners(
	file: SeasonFile,
	files: readonly SeasonFile[],
	kind: MarkerKind
): SeasonFile[] {
	const seen = new Set<string>([file.episodeId]);
	const candidates = files
		.filter(
			(other) =>
				other.id !== file.id &&
				other.version === file.version &&
				other.hopMs === file.hopMs &&
				other[kind] !== undefined
		)
		.sort(
			(x, y) =>
				Math.abs(x.seasonNumber - file.seasonNumber) -
					Math.abs(y.seasonNumber - file.seasonNumber) ||
				Math.abs(x.episodeNumber - file.episodeNumber) -
					Math.abs(y.episodeNumber - file.episodeNumber) ||
				x.episodeNumber - y.episodeNumber ||
				x.id.localeCompare(y.id)
		);
	const out: SeasonFile[] = [];
	for (const other of candidates) {
		if (seen.has(other.episodeId)) continue;
		seen.add(other.episodeId);
		out.push(other);
		if (out.length >= MAX_PARTNERS) break;
	}
	return out;
}

interface Interval {
	startMs: number;
	endMs: number;
}

/**
 * The longest stretch covered by at least `need` partner segments, with the
 * highest coverage reached inside it.
 */
export function consensus(
	segments: readonly Interval[],
	need: number
): (Interval & { support: number }) | null {
	const events: Array<[time: number, delta: number]> = [];
	for (const s of segments) {
		if (s.endMs <= s.startMs) continue;
		events.push([s.startMs, 1], [s.endMs, -1]);
	}
	// Ends before starts at the same instant: touching segments don't overlap.
	events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

	const spans: Array<Interval & { support: number }> = [];
	let depth = 0;
	let open: (Interval & { support: number }) | null = null;
	for (const [time, delta] of events) {
		depth += delta;
		if (depth >= need) {
			if (!open) open = { startMs: time, endMs: time, support: depth };
			else open.support = Math.max(open.support, depth);
		} else if (open) {
			open.endMs = time;
			spans.push(open);
			open = null;
		}
	}

	const merged: Array<Interval & { support: number }> = [];
	for (const span of spans) {
		const last = merged.at(-1);
		if (last && span.startMs - last.endMs <= MERGE_GAP_MS) {
			last.endMs = span.endMs;
			last.support = Math.max(last.support, span.support);
		} else merged.push({ ...span });
	}
	let best: (Interval & { support: number }) | null = null;
	for (const span of merged) {
		if (!best || span.endMs - span.startMs > best.endMs - best.startMs) best = span;
	}
	return best;
}

export interface DetectOptions {
	/** Called between pair comparisons so a long season doesn't block the event loop. */
	yieldControl?: () => Promise<void>;
}

/**
 * Markers for every file in `targets` (default: all), comparing against any
 * file in `files` (targets' seasons plus borrowed neighbours).
 */
export async function detectSeasonMarkers(
	files: readonly SeasonFile[],
	targets: ReadonlySet<string> | null = null,
	opts: DetectOptions = {}
): Promise<Map<string, DetectedMarker[]>> {
	const pairCache = new Map<string, SharedSegment | null>();
	const result = new Map<string, DetectedMarker[]>();

	const compare = async (
		kind: MarkerKind,
		x: SeasonFile,
		y: SeasonFile
	): Promise<SharedSegment | null> => {
		const flip = x.id > y.id;
		const [first, second] = flip ? [y, x] : [x, y];
		const key = `${kind}|${first.id}|${second.id}`;
		let segment = pairCache.get(key);
		if (segment === undefined) {
			await opts.yieldControl?.();
			const rules = RULES[kind];
			segment = compareFingerprints(first[kind]!.fingerprint, second[kind]!.fingerprint, {
				hopMs: first.hopMs,
				minMs: rules.minMs,
				maxMs: rules.maxMs
			});
			pairCache.set(key, segment);
		}
		if (!segment || !flip) return segment;
		return {
			aStartMs: segment.bStartMs,
			aEndMs: segment.bEndMs,
			bStartMs: segment.aStartMs,
			bEndMs: segment.aEndMs,
			ber: segment.ber
		};
	};

	for (const file of files) {
		if (targets && !targets.has(file.id)) continue;
		const markers: DetectedMarker[] = [];
		for (const kind of ['intro', 'credits'] as const) {
			const region = file[kind];
			if (!region) continue;
			const rules = RULES[kind];
			const partners = pickPartners(file, files, kind);
			if (partners.length === 0) continue;

			const segments: Array<Interval & { ber: number }> = [];
			for (const partner of partners) {
				const segment = await compare(kind, file, partner);
				if (!segment) continue;
				const startMs = region.startMs + segment.aStartMs;
				if (startMs < file.durationMs * rules.minStartFraction) continue;
				segments.push({
					startMs,
					endMs: Math.min(region.startMs + segment.aEndMs, file.durationMs),
					ber: segment.ber
				});
			}

			const single = partners.length === 1;
			const usable = single
				? segments.filter(
						(s) => s.endMs - s.startMs >= SINGLE_PARTNER_MIN_MS && s.ber <= SINGLE_PARTNER_MAX_BER
					)
				: segments;
			const span = consensus(usable, single ? 1 : 2);
			if (!span) continue;
			const length = span.endMs - span.startMs;
			if (length < rules.minMs || length > rules.maxMs) continue;
			markers.push({
				kind,
				source: 'fingerprint',
				startMs: span.startMs,
				endMs: span.endMs,
				confidence: single ? 0.5 : span.support / partners.length
			});
		}
		result.set(file.id, markers);
	}
	return result;
}
