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
}

export interface Series extends MediaBase {
	kind: 'series';
	creator: string;
	endYear?: number;
	seasons: Season[];
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
}

export type MediaItem = Movie | Series;

/** A sidecar text track the player attaches to the <video>. */
export interface SubtitleTrack {
	src: string;
	srclang: string;
	label: string;
	kind: 'captions' | 'subtitles';
}
