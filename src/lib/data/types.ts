export const GENRES = [
	'Sci-Fi',
	'Drama',
	'Thriller',
	'Comedy',
	'Horror',
	'Fantasy',
	'Action',
	'Mystery',
	'Romance',
	'Documentary'
] as const;

export type Genre = (typeof GENRES)[number];

export type Maturity = 'G' | 'PG' | 'PG-13' | 'R' | 'TV-14' | 'TV-MA';

interface MediaBase {
	/** URL slug, e.g. 'the-hollow-meridian' */
	id: string;
	title: string;
	tagline?: string;
	synopsis: string;
	year: number;
	genres: Genre[];
	/** 0–10, one decimal */
	rating: number;
	maturity: Maturity;
	cast: CastMember[];
	/** Drives the generated poster/backdrop gradient art */
	theme: { hue: number; hue2: number };
	posterUrl?: string;
	backdropUrl?: string;
	/** YouTube video id of the trailer (from TMDB); unset = no "Watch trailer" button. */
	trailerKey?: string;
	/** 0–1 of the viewer's last playback (series: their latest episode); unset = nothing to show. */
	progress?: number;
	/** true when the signed-in viewer saved it to their watchlist; unset for guests. */
	inWatchlist?: boolean;
}

export interface CastMember {
	name: string;
	/** Role / character name, when known. */
	character?: string;
	/** Headshot URL (TMDB profile), when available. */
	photoUrl?: string;
}

export interface Movie extends MediaBase {
	kind: 'movie';
	runtimeMinutes: number;
	director: string;
	/** Production budget in USD, when known. */
	budget?: number;
	/** Frame size of the best available file (tallest); only the detail loader fills these. */
	sourceWidth?: number;
	sourceHeight?: number;
}

export interface Series extends MediaBase {
	kind: 'series';
	creator: string;
	endYear?: number;
	seasons: Season[];
	/** Slug of the viewer's most recently watched episode; drives the Play/Resume target. */
	lastWatchedEpisodeId?: string;
}

export interface Season {
	number: number;
	year: number;
	/** Season key art (portrait). */
	posterUrl?: string;
	episodes: Episode[];
}

export interface Episode {
	id: string;
	number: number;
	title: string;
	synopsis: string;
	runtimeMinutes: number;
	/** Episode still (landscape). */
	stillUrl?: string;
	/** 0–1 of the viewer's last playback of this episode. */
	progress?: number;
}

export type MediaItem = Movie | Series;

/** A text track the player attaches to the <video> (served as WebVTT per playback session). */
export interface SubtitleTrack {
	/** media_subtitle row id — keys the <track> and the stream URL. */
	id: string;
	src: string;
	/** ISO 639-1, or 'und' when unknown. */
	srclang: string;
	label: string;
	kind: 'captions' | 'subtitles';
	/** The container flagged it default — auto-selected when the viewer has no remembered language. */
	default: boolean;
	forced: boolean;
}

/** One audio stream of the file being played; switching restarts the session with it. */
export interface AudioTrack {
	/** media_audio row id — sent back as `audioTrackId` to switch. */
	id: string;
	label: string;
	/** ISO 639-1, or 'und' when unknown. */
	language: string;
	/** The container flagged it default. */
	default: boolean;
}
