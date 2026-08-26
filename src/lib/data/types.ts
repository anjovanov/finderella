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
	cast: string[];
	/** Drives the generated poster/backdrop gradient art */
	theme: { hue: number; hue2: number };
	posterUrl?: string;
	backdropUrl?: string;
}

export interface Movie extends MediaBase {
	kind: 'movie';
	runtimeMinutes: number;
	director: string;
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
	episodes: Episode[];
}

export interface Episode {
	id: string;
	number: number;
	title: string;
	synopsis: string;
	runtimeMinutes: number;
}

export type MediaItem = Movie | Series;
