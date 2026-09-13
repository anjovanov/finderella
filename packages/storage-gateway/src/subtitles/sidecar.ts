import { posix } from 'node:path';
import {
	SUBTITLE_EXTENSIONS,
	normalizeLanguage,
	type SubtitleFormat,
	type SubtitleSource
} from '@finderella/protocol';

/** Folder names (case-insensitive) that hold a release's sidecar subtitles. */
export const SUBS_DIR_NAMES = new Set(['subs', 'subtitles']);

const SUBTITLE_EXTENSION_SET = new Set<string>(SUBTITLE_EXTENSIONS);

export function isSubtitleFile(name: string): boolean {
	return SUBTITLE_EXTENSION_SET.has(posix.extname(name).toLowerCase());
}

/** Everything the matcher knows about one directory of a library (posix, library-relative paths). */
export interface DirListing {
	/** Video files directly in the directory. */
	videos: string[];
	/** Subtitle files in the directory, in a child `Subs`/`Subtitles` folder, and in that folder's subfolders. */
	subtitles: string[];
}

function stem(relPath: string): string {
	const base = posix.basename(relPath);
	return base.slice(0, base.length - posix.extname(base).length);
}

// Flags win over language codes: `.hi.srt` means hearing-impaired by convention
// (Hindi sidecars say `hin`/`hindi`; ffprobe tags go through normalizeLanguage
// directly, where `hi` still means Hindi).
const HEARING_IMPAIRED_TOKENS = new Set(['sdh', 'hi', 'cc']);
const FORCED_TOKENS = new Set(['forced']);
const MAX_TITLE_TOKENS = 3;

export type SidecarSubtitle = Extract<SubtitleSource, { source: 'sidecar' }>;

export interface SidecarDescription {
	language?: string;
	title?: string;
	forced: boolean;
	hearingImpaired: boolean;
}

/**
 * Read language / forced / SDH flags out of the part of a subtitle filename
 * that isn't the video's name: `en`, `eng.forced`, `2_English`, `English SDH`.
 * Leftover words become a short title (`commentary`); long junk is dropped.
 */
export function describeSidecar(leftover: string): SidecarDescription {
	const out: SidecarDescription = { forced: false, hearingImpaired: false };
	const titleTokens: string[] = [];
	for (const token of leftover.split(/[._\-\s]+/)) {
		if (!token) continue;
		const lower = token.toLowerCase();
		if (/^\d+$/.test(lower)) continue; // RARBG-style `2_English`
		if (FORCED_TOKENS.has(lower)) out.forced = true;
		else if (HEARING_IMPAIRED_TOKENS.has(lower)) out.hearingImpaired = true;
		else {
			const language = normalizeLanguage(lower);
			if (language && !out.language) out.language = language;
			else if (!language) titleTokens.push(token);
		}
	}
	if (titleTokens.length > 0 && titleTokens.length <= MAX_TITLE_TOKENS) {
		out.title = titleTokens.join(' ');
	}
	return out;
}

function isSampleName(relPath: string): boolean {
	return /sample/i.test(posix.basename(relPath));
}

/**
 * Sidecar subtitle files that belong to one video. A candidate matches when
 * its name starts with the video's name (`Movie.en.srt` for `Movie.mkv`),
 * when it sits in `Subs/<video name>/`, or when the video is the only
 * non-sample video in its folder (then every candidate is its own).
 */
export function matchSidecars(videoRelPath: string, listing: DirListing): SidecarSubtitle[] {
	const videoStem = stem(videoRelPath);
	const videoStemLower = videoStem.toLowerCase();
	const realVideos = listing.videos.filter((v) => !isSampleName(v));
	const loneVideo = realVideos.length === 1 && realVideos[0] === videoRelPath;
	const out: SidecarSubtitle[] = [];

	for (const relPath of listing.subtitles) {
		if (!isSubtitleFile(relPath)) continue;
		const candidateStem = stem(relPath);
		const candidateLower = candidateStem.toLowerCase();
		let leftover: string | null = null;
		if (candidateLower.startsWith(videoStemLower)) {
			const rest = candidateStem.slice(videoStem.length);
			// `Show.S01E01` must not claim `Show.S01E010.srt`.
			if (rest === '' || /^[._\-\s]/.test(rest)) leftover = rest;
		}
		if (leftover === null) {
			const parent = posix.basename(posix.dirname(relPath)).toLowerCase();
			if (parent === videoStemLower) leftover = candidateStem;
		}
		if (leftover === null && loneVideo) leftover = candidateStem;
		if (leftover === null) continue;

		const format = posix.extname(relPath).slice(1).toLowerCase() as SubtitleFormat;
		const description = describeSidecar(leftover);
		out.push({
			source: 'sidecar',
			relPath,
			format,
			language: description.language,
			title: description.title,
			forced: description.forced,
			hearingImpaired: description.hearingImpaired
		});
	}
	return out;
}
