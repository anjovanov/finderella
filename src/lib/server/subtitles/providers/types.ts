export type SubtitleProviderId = 'opensubtitles' | 'subdl' | 'gestdown' | 'titlovi';

/** One downloadable subtitle as the provider lists it, in a provider-neutral shape. */
export interface SubtitleCandidate {
	provider: SubtitleProviderId;
	/** Provider-specific handle: OpenSubtitles `file_id`, Subdl download path. */
	id: string;
	/** Our ISO 639-1 code. */
	language: string;
	releaseName: string;
	fileName?: string;
	hearingImpaired: boolean;
	forced: boolean;
	downloads: number;
	/** 0–10 when the provider rates uploads, else 0. */
	rating: number;
	trusted: boolean;
	aiTranslated: boolean;
	machineTranslated: boolean;
	/** Exact file-hash match reported by the provider (OpenSubtitles moviehash). */
	hashMatch: boolean;
	uploader?: string;
	fps?: number;
	/** Provider page for attribution links. */
	url?: string;
	/** Titlovi lists Serbian Cyrillic as its own language; picks the Cyrillic archive entry. */
	script?: 'cyrillic';
	/** Extra badge text: Gestdown's upstream source, "season pack", … */
	note?: string;
}

/** What we know about the title being searched (from the catalog rows). */
export interface TitleQuery {
	kind: 'movie' | 'episode';
	/** Movie's TMDB id, or the series' TMDB id for episodes. */
	tmdbId?: number;
	title: string;
	year?: number;
	season?: number;
	episode?: number;
	/** Basename of the video file — release-name matching. */
	fileName: string;
}

export type ProviderErrorKind = 'not-configured' | 'auth' | 'quota' | 'rate-limit' | 'network';

/** A provider-level failure the UI should explain rather than retry blindly. */
export class ProviderError extends Error {
	constructor(
		public readonly provider: SubtitleProviderId,
		public readonly kind: ProviderErrorKind,
		message: string,
		public readonly resetAt?: Date
	) {
		super(message);
		this.name = 'ProviderError';
	}
}

export interface DownloadedSubtitle {
	bytes: Uint8Array;
	/** File extension without the dot (srt/vtt/ass/ssa). */
	format: string;
}
