/**
 * Admin statistics: client-safe types, period options and labels shared by the
 * /admin/statistics pages and the server queries in $lib/server/stats.
 */

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'tv' | 'unknown';
export type PlayerState = 'playing' | 'paused' | 'buffering' | 'unknown';

/** Plays shorter than this (playing time) are not history: preview starts, misclicks. */
export const MIN_PLAY_SECONDS = 30;

export const STAT_PERIODS = [
	{ days: 7, label: '7 days' },
	{ days: 30, label: '30 days' },
	{ days: 90, label: '90 days' },
	{ days: 365, label: '1 year' }
] as const;
export type StatPeriod = (typeof STAT_PERIODS)[number]['days'];
export const DEFAULT_STAT_PERIOD: StatPeriod = 30;

/** `?days=` → a known period (anything else → the default). */
export function parsePeriod(value: string | null): StatPeriod {
	const days = Number(value);
	return STAT_PERIODS.find((p) => p.days === days)?.days ?? DEFAULT_STAT_PERIOD;
}

export interface Platform {
	browser: string | null;
	browserVersion?: string | null;
	os: string | null;
	deviceType: DeviceType;
}

/** "Chrome · Windows", "Safari · iOS", "Unknown". */
export function platformLabel(p: Pick<Platform, 'browser' | 'os'>): string {
	const parts = [p.browser, p.os].filter(Boolean);
	return parts.length ? parts.join(' · ') : 'Unknown';
}

export const DEVICE_LABELS: Record<DeviceType, string> = {
	desktop: 'Desktop',
	mobile: 'Phone',
	tablet: 'Tablet',
	tv: 'TV',
	unknown: 'Unknown device'
};

export interface StatUser {
	id: string;
	name: string;
	image: string | null;
}

/** A title reference that can link back to the catalog (slugs null once pruned). */
export interface PlayTitle {
	kind: 'movie' | 'episode';
	/** Movie title or episode title. */
	title: string;
	seriesTitle: string | null;
	seasonNumber: number | null;
	episodeNumber: number | null;
	year: number | null;
	/** Movie slug / series slug. */
	slug: string | null;
	episodeSlug: string | null;
	posterUrl: string | null;
}

/** "Inception (2010)", "Severance — S1E4 · The You You Are". */
export function playTitleLabel(t: PlayTitle): string {
	if (t.kind === 'movie') return t.year ? `${t.title} (${t.year})` : t.title;
	return `${t.seriesTitle ?? 'Unknown series'} — ${episodeCode(t)} · ${t.title}`;
}

export function episodeCode(t: Pick<PlayTitle, 'seasonNumber' | 'episodeNumber'>): string {
	return `S${t.seasonNumber ?? '?'}E${t.episodeNumber ?? '?'}`;
}

export interface ActiveStream {
	sessionId: string;
	user: StatUser | null;
	title: PlayTitle;
	backdropUrl: string | null;
	state: PlayerState;
	positionSeconds: number;
	durationSeconds: number | null;
	startedAt: string;
	platform: Platform;
	/** 'direct' = the original file; 'hls' = transcoded on the device. */
	mode: 'direct' | 'hls';
	quality: string;
	/** Frame size of the transcode output (hls) — null for direct play. */
	streamWidth: number | null;
	source: {
		width: number | null;
		height: number | null;
		container: string;
		videoCodec: string | null;
		audioCodec: string | null;
		bitrate: number | null;
	};
	audioLabel: string | null;
	/** Output channels of the transcode (hls). */
	audioChannels: number | null;
	subtitleLabel: string | null;
	device: { id: string; name: string };
	/** Hub → viewer throughput over the last heartbeat interval. */
	bitrateBps: number;
	bytesSent: number;
	terminating: boolean;
}

export interface HistoryEntry {
	id: string;
	user: StatUser | null;
	title: PlayTitle;
	platform: Platform;
	startedAt: string;
	stoppedAt: string | null;
	playedSeconds: number;
	pausedSeconds: number;
	positionSeconds: number;
	durationSeconds: number | null;
	transcoded: boolean;
	quality: string | null;
	bytesSent: number;
}

export interface HistoryPage {
	entries: HistoryEntry[];
	total: number;
	page: number;
	perPage: number;
}

export interface StatSummary {
	plays: number;
	playedSeconds: number;
	viewers: number;
	/** Share of plays that transcoded (0..1). */
	transcodedShare: number;
}

/** A movie or a whole series in a "most watched" list. */
export interface TopTitle {
	kind: 'movie' | 'series';
	title: string;
	year: number | null;
	/** Movie / series slug; null once the title left the catalog. */
	slug: string | null;
	posterUrl: string | null;
	plays: number;
	playedSeconds: number;
	viewers: number;
}

export interface TopEntry {
	key: string;
	label: string;
	plays: number;
	playedSeconds: number;
	user?: StatUser | null;
}

export interface DayPoint {
	/** YYYY-MM-DD in the viewer's time zone. */
	day: string;
	movies: number;
	episodes: number;
	direct: number;
	transcoded: number;
}

export interface BucketPoint {
	bucket: number;
	label: string;
	movies: number;
	episodes: number;
}

/** Both metrics for every chart; the Plays / Watch time toggle is client-side. */
export interface GraphData {
	plays: { byDay: DayPoint[]; byWeekday: BucketPoint[]; byHour: BucketPoint[] };
	duration: { byDay: DayPoint[]; byWeekday: BucketPoint[]; byHour: BucketPoint[] };
	platforms: TopEntry[];
	users: TopEntry[];
}

/** Sortable columns of the users table (`?sort=`). */
export const USER_SORT_KEYS = ['name', 'lastSeen', 'lastPlayed', 'plays', 'duration'] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];

export interface UserStatsRow {
	user: StatUser & { email: string; isAdmin: boolean; banned: boolean };
	lastSeenAt: string | null;
	lastPlayed: { title: PlayTitle; at: string } | null;
	lastPlatform: Platform | null;
	plays: number;
	playedSeconds: number;
}

export interface WatchTimeWindow {
	label: string;
	plays: number;
	playedSeconds: number;
}

export interface LibraryStatsRow {
	id: string;
	name: string;
	kind: 'movie' | 'series';
	device: { id: string; name: string; online: boolean };
	titles: number;
	seasons: number;
	episodes: number;
	files: number;
	bytes: number;
	durationSeconds: number;
	lastScanAt: string | null;
	plays: number;
	lastPlayed: { title: PlayTitle; at: string } | null;
}

export interface Breakdown {
	label: string;
	files: number;
	bytes: number;
}

export interface LibraryBreakdowns {
	resolution: Breakdown[];
	videoCodec: Breakdown[];
	container: Breakdown[];
	audioCodec: Breakdown[];
}

export interface RecentlyAddedFile {
	id: string;
	title: PlayTitle;
	libraryName: string;
	addedAt: string;
	bytes: number;
	width: number | null;
}
