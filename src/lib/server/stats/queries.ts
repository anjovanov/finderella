import {
	and,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	episode,
	gateway,
	library,
	mediaFile,
	movie,
	playHistory,
	season,
	series,
	user,
	userActivity
} from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { isAdmin } from '$lib/auth-roles';
import { resolutionLabel } from '$lib/playback-quality';
import {
	MIN_PLAY_SECONDS,
	type Breakdown,
	type BucketPoint,
	type DayPoint,
	type DeviceType,
	type GraphData,
	type HistoryEntry,
	type HistoryPage,
	type LibraryBreakdowns,
	type LibraryStatsRow,
	type Platform,
	type PlayTitle,
	type RecentlyAddedFile,
	type StatSummary,
	type StatUser,
	type TopEntry,
	type TopTitle,
	type UserSortKey,
	type UserStatsRow,
	type WatchTimeWindow
} from '$lib/data/stats';
import { dayRange, fillDays, hourLabel, todayIn, WEEKDAY_LABELS } from './period';

/**
 * Admin statistics queries over `play_history` (+ the catalog for library
 * stats). Every play query counts only rows with at least MIN_PLAY_SECONDS
 * of playing time — shorter rows are open sessions still warming up.
 */

const counted = gte(playHistory.playedSeconds, MIN_PLAY_SECONDS);

/** Start of the period: midnight `days - 1` days ago on the admin's calendar. */
function since(days: number, tz: string): SQL {
	return sql`${playHistory.startedAt} >= ((date_trunc('day', now() at time zone ${tz}) - make_interval(days => ${days - 1})) at time zone ${tz})`;
}

// ── title / user / platform mapping ─────────────────────────────────────────

const titleColumns = {
	kind: playHistory.kind,
	title: playHistory.title,
	seriesTitle: playHistory.seriesTitle,
	seasonNumber: playHistory.seasonNumber,
	episodeNumber: playHistory.episodeNumber,
	year: playHistory.year,
	movieSlug: movie.slug,
	moviePoster: movie.posterUrl,
	seriesSlug: series.slug,
	seriesPoster: series.posterUrl,
	episodeSlug: episode.slug
};

type TitleRow = {
	kind: 'movie' | 'episode';
	title: string;
	seriesTitle: string | null;
	seasonNumber: number | null;
	episodeNumber: number | null;
	year: number | null;
	movieSlug: string | null;
	moviePoster: string | null;
	seriesSlug: string | null;
	seriesPoster: string | null;
	episodeSlug: string | null;
};

function toPlayTitle(row: TitleRow): PlayTitle {
	const isMovie = row.kind === 'movie';
	return {
		kind: row.kind,
		title: row.title,
		seriesTitle: row.seriesTitle,
		seasonNumber: row.seasonNumber,
		episodeNumber: row.episodeNumber,
		year: row.year,
		slug: isMovie ? row.movieSlug : row.seriesSlug,
		episodeSlug: isMovie ? null : row.episodeSlug,
		posterUrl: isMovie ? row.moviePoster : row.seriesPoster
	};
}

const userColumns = { userName: user.name, userImage: user.image };

function toStatUser(
	id: string | null,
	row: { userName: string | null; userImage: string | null }
): StatUser | null {
	return id ? { id, name: row.userName ?? 'Deleted user', image: row.userImage } : null;
}

const platformColumns = {
	browser: playHistory.browser,
	browserVersion: playHistory.browserVersion,
	os: playHistory.os,
	deviceType: playHistory.deviceType
};

function toPlatform(row: {
	browser: string | null;
	browserVersion?: string | null;
	os: string | null;
	deviceType: string | null;
}): Platform {
	return {
		browser: row.browser,
		browserVersion: row.browserVersion ?? null,
		os: row.os,
		deviceType: (row.deviceType ?? 'unknown') as DeviceType
	};
}

/** play_history joined with what its title and user rows still provide. */
function historyQuery() {
	return db
		.select({
			id: playHistory.id,
			userId: playHistory.userId,
			...userColumns,
			...titleColumns,
			...platformColumns,
			startedAt: playHistory.startedAt,
			stoppedAt: playHistory.stoppedAt,
			playedSeconds: playHistory.playedSeconds,
			pausedSeconds: playHistory.pausedSeconds,
			positionSeconds: playHistory.positionSeconds,
			durationSeconds: playHistory.durationSeconds,
			transcoded: playHistory.transcoded,
			quality: playHistory.quality,
			bytesSent: playHistory.bytesSent
		})
		.from(playHistory)
		.leftJoin(user, eq(user.id, playHistory.userId))
		.leftJoin(movie, eq(movie.id, playHistory.movieId))
		.leftJoin(series, eq(series.id, playHistory.seriesId))
		.leftJoin(episode, eq(episode.id, playHistory.episodeId));
}

type HistoryRow = Awaited<ReturnType<typeof historyQuery>>[number];

function toHistoryEntry(row: HistoryRow): HistoryEntry {
	return {
		id: row.id,
		user: toStatUser(row.userId, row),
		title: toPlayTitle(row),
		platform: toPlatform(row),
		startedAt: row.startedAt.toISOString(),
		stoppedAt: row.stoppedAt?.toISOString() ?? null,
		playedSeconds: row.playedSeconds,
		pausedSeconds: row.pausedSeconds,
		positionSeconds: row.positionSeconds,
		durationSeconds: row.durationSeconds,
		transcoded: row.transcoded,
		quality: row.quality,
		bytesSent: row.bytesSent
	};
}

// ── summary + top lists ─────────────────────────────────────────────────────

export async function summary(days: number, tz: string): Promise<StatSummary> {
	const [row] = await db
		.select({
			plays: count(),
			playedSeconds: sql<number>`coalesce(sum(${playHistory.playedSeconds}), 0)`.mapWith(Number),
			viewers:
				sql<number>`count(distinct coalesce(${playHistory.userId}, 'guest:' || coalesce(${playHistory.userAgent}, '')))`.mapWith(
					Number
				),
			transcoded: sql<number>`count(*) filter (where ${playHistory.transcoded})`.mapWith(Number)
		})
		.from(playHistory)
		.where(and(counted, since(days, tz)));
	return {
		plays: row.plays,
		playedSeconds: row.playedSeconds,
		viewers: row.viewers,
		transcodedShare: row.plays ? row.transcoded / row.plays : 0
	};
}

const playsCol = sql<number>`count(*)`.mapWith(Number);
const secondsCol = sql<number>`coalesce(sum(${playHistory.playedSeconds}), 0)`.mapWith(Number);
const viewersCol = sql<number>`count(distinct coalesce(${playHistory.userId}, 'guest'))`.mapWith(
	Number
);

export async function topMovies(days: number, tz: string, limit = 5): Promise<TopTitle[]> {
	const rows = await db
		.select({
			title: playHistory.title,
			year: playHistory.year,
			slug: movie.slug,
			posterUrl: movie.posterUrl,
			plays: playsCol,
			playedSeconds: secondsCol,
			viewers: viewersCol
		})
		.from(playHistory)
		.leftJoin(movie, eq(movie.id, playHistory.movieId))
		.where(and(counted, since(days, tz), eq(playHistory.kind, 'movie')))
		.groupBy(playHistory.movieId, playHistory.title, playHistory.year, movie.slug, movie.posterUrl)
		.orderBy(desc(playsCol), desc(secondsCol))
		.limit(limit);
	return rows.map((r) => ({ kind: 'movie', ...r }));
}

export async function topSeries(days: number, tz: string, limit = 5): Promise<TopTitle[]> {
	const rows = await db
		.select({
			title: playHistory.seriesTitle,
			year: playHistory.year,
			slug: series.slug,
			posterUrl: series.posterUrl,
			plays: playsCol,
			playedSeconds: secondsCol,
			viewers: viewersCol
		})
		.from(playHistory)
		.leftJoin(series, eq(series.id, playHistory.seriesId))
		.where(and(counted, since(days, tz), eq(playHistory.kind, 'episode')))
		.groupBy(
			playHistory.seriesId,
			playHistory.seriesTitle,
			playHistory.year,
			series.slug,
			series.posterUrl
		)
		.orderBy(desc(playsCol), desc(secondsCol))
		.limit(limit);
	return rows.map((r) => ({ kind: 'series', ...r, title: r.title ?? 'Unknown series' }));
}

export async function topUsers(days: number, tz: string, limit = 5): Promise<TopEntry[]> {
	const rows = await db
		.select({
			userId: playHistory.userId,
			...userColumns,
			plays: playsCol,
			playedSeconds: secondsCol
		})
		.from(playHistory)
		.leftJoin(user, eq(user.id, playHistory.userId))
		.where(and(counted, since(days, tz)))
		.groupBy(playHistory.userId, user.name, user.image)
		.orderBy(desc(secondsCol))
		.limit(limit);
	return rows.map((r) => ({
		key: r.userId ?? 'guest',
		label: r.userId ? (r.userName ?? 'Deleted user') : 'Guests',
		plays: r.plays,
		playedSeconds: r.playedSeconds,
		user: toStatUser(r.userId, r)
	}));
}

export async function topPlatforms(days: number, tz: string, limit = 5): Promise<TopEntry[]> {
	const rows = await db
		.select({
			browser: playHistory.browser,
			os: playHistory.os,
			plays: playsCol,
			playedSeconds: secondsCol
		})
		.from(playHistory)
		.where(and(counted, since(days, tz)))
		.groupBy(playHistory.browser, playHistory.os)
		.orderBy(desc(playsCol))
		.limit(limit);
	return rows.map((r) => ({
		key: `${r.browser ?? ''}|${r.os ?? ''}`,
		label: [r.browser, r.os].filter(Boolean).join(' · ') || 'Unknown',
		plays: r.plays,
		playedSeconds: r.playedSeconds
	}));
}

export async function recentlyWatched(limit = 8): Promise<HistoryEntry[]> {
	const rows = await historyQuery()
		.where(counted)
		.orderBy(desc(playHistory.startedAt))
		.limit(limit);
	return rows.map(toHistoryEntry);
}

// ── graphs ──────────────────────────────────────────────────────────────────

function bucketColumns() {
	return {
		movies: sql<number>`count(*) filter (where ${playHistory.kind} = 'movie')`.mapWith(Number),
		episodes: sql<number>`count(*) filter (where ${playHistory.kind} = 'episode')`.mapWith(Number),
		direct: sql<number>`count(*) filter (where not ${playHistory.transcoded})`.mapWith(Number),
		transcoded: sql<number>`count(*) filter (where ${playHistory.transcoded})`.mapWith(Number),
		movieSeconds:
			sql<number>`coalesce(sum(${playHistory.playedSeconds}) filter (where ${playHistory.kind} = 'movie'), 0)`.mapWith(
				Number
			),
		episodeSeconds:
			sql<number>`coalesce(sum(${playHistory.playedSeconds}) filter (where ${playHistory.kind} = 'episode'), 0)`.mapWith(
				Number
			),
		directSeconds:
			sql<number>`coalesce(sum(${playHistory.playedSeconds}) filter (where not ${playHistory.transcoded}), 0)`.mapWith(
				Number
			),
		transcodedSeconds:
			sql<number>`coalesce(sum(${playHistory.playedSeconds}) filter (where ${playHistory.transcoded}), 0)`.mapWith(
				Number
			)
	};
}

type BucketRow =
	ReturnType<typeof bucketColumns> extends infer C ? { [K in keyof C]: number } : never;

const hours = (seconds: number) => Math.round(seconds / 360) / 10;

function splitBuckets<K extends string>(rows: (BucketRow & Record<K, string | number>)[], key: K) {
	return {
		plays: rows.map((r) => ({
			key: r[key],
			movies: r.movies,
			episodes: r.episodes,
			direct: r.direct,
			transcoded: r.transcoded
		})),
		// Watch time in hours (one decimal) for the charts.
		duration: rows.map((r) => ({
			key: r[key],
			movies: hours(r.movieSeconds),
			episodes: hours(r.episodeSeconds),
			direct: hours(r.directSeconds),
			transcoded: hours(r.transcodedSeconds)
		}))
	};
}

export async function graphData(days: number, tz: string): Promise<GraphData> {
	const local = sql`(${playHistory.startedAt} at time zone ${tz})`;
	const where = and(counted, since(days, tz));
	const [byDayRows, byWeekdayRows, byHourRows, platforms, users] = await Promise.all([
		db
			.select({ day: sql<string>`to_char(${local}, 'YYYY-MM-DD')`, ...bucketColumns() })
			.from(playHistory)
			.where(where)
			.groupBy(sql`1`),
		db
			.select({
				bucket: sql<number>`extract(isodow from ${local})::int`.mapWith(Number),
				...bucketColumns()
			})
			.from(playHistory)
			.where(where)
			.groupBy(sql`1`),
		db
			.select({
				bucket: sql<number>`extract(hour from ${local})::int`.mapWith(Number),
				...bucketColumns()
			})
			.from(playHistory)
			.where(where)
			.groupBy(sql`1`),
		topPlatforms(days, tz, 8),
		topUsers(days, tz, 8)
	]);

	const range = dayRange(todayIn(tz), days);
	const byDay = splitBuckets(byDayRows, 'day');
	const byWeekday = splitBuckets(byWeekdayRows, 'bucket');
	const byHour = splitBuckets(byHourRows, 'bucket');
	const emptyDay = (day: string): DayPoint => ({
		day,
		movies: 0,
		episodes: 0,
		direct: 0,
		transcoded: 0
	});
	const toDays = (points: typeof byDay.plays) =>
		fillDays(
			points.map(({ key, ...rest }) => ({ day: String(key), ...rest })),
			range,
			emptyDay
		);
	const toBuckets = (
		points: typeof byWeekday.plays,
		keys: number[],
		label: (k: number) => string
	) => {
		const byKey = new Map(points.map((p) => [Number(p.key), p]));
		return keys.map((k): BucketPoint => ({
			bucket: k,
			label: label(k),
			movies: byKey.get(k)?.movies ?? 0,
			episodes: byKey.get(k)?.episodes ?? 0
		}));
	};
	const weekdays = [1, 2, 3, 4, 5, 6, 7];
	const hours = Array.from({ length: 24 }, (_, h) => h);
	const weekdayLabel = (k: number) => WEEKDAY_LABELS[k - 1];
	return {
		plays: {
			byDay: toDays(byDay.plays),
			byWeekday: toBuckets(byWeekday.plays, weekdays, weekdayLabel),
			byHour: toBuckets(byHour.plays, hours, hourLabel)
		},
		duration: {
			byDay: toDays(byDay.duration),
			byWeekday: toBuckets(byWeekday.duration, weekdays, weekdayLabel),
			byHour: toBuckets(byHour.duration, hours, hourLabel)
		},
		platforms,
		users
	};
}

// ── history ─────────────────────────────────────────────────────────────────

export const HISTORY_PAGE_SIZE = 25;

export interface HistoryFilter {
	page: number;
	/** A user id, 'guest', or undefined for everyone. */
	userId?: string;
	kind?: 'movie' | 'episode';
	days?: number;
	tz: string;
}

export async function history(filter: HistoryFilter): Promise<HistoryPage> {
	const where = and(
		counted,
		filter.userId === 'guest'
			? isNull(playHistory.userId)
			: filter.userId
				? eq(playHistory.userId, filter.userId)
				: undefined,
		filter.kind ? eq(playHistory.kind, filter.kind) : undefined,
		filter.days ? since(filter.days, filter.tz) : undefined
	);
	const page = Math.max(1, filter.page);
	const [[{ total }], rows] = await Promise.all([
		db.select({ total: count() }).from(playHistory).where(where),
		historyQuery()
			.where(where)
			.orderBy(desc(playHistory.startedAt))
			.limit(HISTORY_PAGE_SIZE)
			.offset((page - 1) * HISTORY_PAGE_SIZE)
	]);
	return { entries: rows.map(toHistoryEntry), total, page, perPage: HISTORY_PAGE_SIZE };
}

// ── users ───────────────────────────────────────────────────────────────────

/** Each viewer's most recent play (DISTINCT ON user_id; guests share the null key). */
async function latestPlays(userIds: (string | null)[]) {
	const ids = userIds.filter((id): id is string => id !== null);
	const guests = userIds.includes(null);
	if (ids.length === 0 && !guests) return [];
	return db
		.selectDistinctOn([playHistory.userId], {
			userId: playHistory.userId,
			...titleColumns,
			...platformColumns,
			startedAt: playHistory.startedAt,
			lastActiveAt: playHistory.lastActiveAt
		})
		.from(playHistory)
		.leftJoin(movie, eq(movie.id, playHistory.movieId))
		.leftJoin(series, eq(series.id, playHistory.seriesId))
		.leftJoin(episode, eq(episode.id, playHistory.episodeId))
		.where(
			and(
				counted,
				or(
					ids.length ? inArray(playHistory.userId, ids) : undefined,
					guests ? isNull(playHistory.userId) : undefined
				)
			)
		)
		.orderBy(playHistory.userId, desc(playHistory.startedAt));
}

export interface GuestStats {
	plays: number;
	playedSeconds: number;
	lastPlayed: UserStatsRow['lastPlayed'];
	lastPlatform: Platform | null;
}

export const USERS_PAGE_SIZE = 25;

export interface UserQuery {
	page?: number;
	sort?: UserSortKey;
	desc?: boolean;
	/** One account only (the user detail page). */
	userId?: string;
}

/** Per-user play totals — the sort keys for plays / watch time / last played / last seen. */
function userTotals() {
	return db
		.select({
			userId: playHistory.userId,
			plays: sql<number>`count(*)`.as('plays'),
			playedSeconds: sql<number>`sum(${playHistory.playedSeconds})`.as('played_seconds'),
			lastPlayedAt: sql<Date>`max(${playHistory.startedAt})`.as('last_played_at'),
			lastActiveAt: sql<Date>`max(${playHistory.lastActiveAt})`.as('last_active_at')
		})
		.from(playHistory)
		.where(and(counted, isNotNull(playHistory.userId)))
		.groupBy(playHistory.userId)
		.as('totals');
}

/**
 * One page of accounts with their activity, sorted in SQL so paging works for
 * any column. Title/platform of each account's last play are fetched for the
 * page only.
 */
export async function userStats(query: UserQuery = {}): Promise<{
	users: UserStatsRow[];
	guests: GuestStats | null;
	total: number;
	page: number;
	perPage: number;
}> {
	const totals = userTotals();
	// Whichever is newer: a page request or a heartbeat-fed play row (greatest() skips nulls).
	const lastSeen = sql`greatest(${userActivity.lastSeenAt}, ${totals.lastActiveAt})`;
	const sortExpr: Record<UserSortKey, SQL> = {
		name: sql`lower(${user.name})`,
		lastSeen,
		lastPlayed: sql`${totals.lastPlayedAt}`,
		plays: sql`coalesce(${totals.plays}, 0)`,
		duration: sql`coalesce(${totals.playedSeconds}, 0)`
	};
	const sort = query.sort ?? 'lastSeen';
	const direction = (query.desc ?? sort !== 'name') ? sql`desc` : sql`asc`;
	const where = query.userId ? eq(user.id, query.userId) : undefined;
	const page = Math.max(1, query.page ?? 1);

	const [[{ total }], rows] = await Promise.all([
		db.select({ total: count() }).from(user).where(where),
		db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				role: user.role,
				banned: user.banned,
				plays: sql<number>`coalesce(${totals.plays}, 0)`.mapWith(Number),
				playedSeconds: sql<number>`coalesce(${totals.playedSeconds}, 0)`.mapWith(Number),
				lastSeenAt: sql<string | null>`${lastSeen}`.mapWith((v) =>
					v ? new Date(v).toISOString() : null
				)
			})
			.from(user)
			.leftJoin(totals, eq(totals.userId, user.id))
			.leftJoin(userActivity, eq(userActivity.userId, user.id))
			.where(where)
			.orderBy(sql`${sortExpr[sort]} ${direction} nulls last`, user.id)
			.limit(USERS_PAGE_SIZE)
			.offset((page - 1) * USERS_PAGE_SIZE)
	]);

	const onLastPage = page * USERS_PAGE_SIZE >= total;
	const wantGuests = !query.userId && onLastPage;
	const [latest, guestTotals] = await Promise.all([
		latestPlays([...rows.map((r) => r.id), ...(wantGuests ? [null] : [])]),
		wantGuests
			? db
					.select({ plays: playsCol, playedSeconds: secondsCol })
					.from(playHistory)
					.where(and(counted, isNull(playHistory.userId)))
			: []
	]);
	const latestBy = new Map(latest.map((l) => [l.userId, l]));
	const lastPlayedOf = (id: string | null) => {
		const l = latestBy.get(id);
		return l ? { title: toPlayTitle(l), at: l.startedAt.toISOString() } : null;
	};
	const guestLatest = latestBy.get(null);
	const guests = guestTotals[0]?.plays ? guestTotals[0] : null;

	return {
		users: rows.map((u) => ({
			user: {
				id: u.id,
				name: u.name,
				image: u.image,
				email: u.email,
				isAdmin: isAdmin(u),
				banned: u.banned ?? false
			},
			lastSeenAt: u.lastSeenAt,
			lastPlayed: lastPlayedOf(u.id),
			lastPlatform: latestBy.has(u.id) ? toPlatform(latestBy.get(u.id)!) : null,
			plays: u.plays,
			playedSeconds: u.playedSeconds
		})),
		guests: guests
			? {
					plays: guests.plays,
					playedSeconds: guests.playedSeconds,
					lastPlayed: lastPlayedOf(null),
					lastPlatform: guestLatest ? toPlatform(guestLatest) : null
				}
			: null,
		total,
		page,
		perPage: USERS_PAGE_SIZE
	};
}

export interface UserDetail {
	row: UserStatsRow;
	windows: WatchTimeWindow[];
	platforms: TopEntry[];
}

export async function userDetail(userId: string): Promise<UserDetail | null> {
	const {
		users: [row]
	} = await userStats({ userId });
	if (!row) return null;
	const within = (hours: number | null) =>
		hours === null
			? sql`true`
			: sql`${playHistory.startedAt} >= now() - make_interval(hours => ${hours})`;
	const playsWithin = (hours: number | null) =>
		sql<number>`count(*) filter (where ${within(hours)})`.mapWith(Number);
	const secondsWithin = (hours: number | null) =>
		sql<number>`coalesce(sum(${playHistory.playedSeconds}) filter (where ${within(hours)}), 0)`.mapWith(
			Number
		);
	const windows = [
		{ label: 'Last 24 hours', hours: 24 },
		{ label: 'Last 7 days', hours: 24 * 7 },
		{ label: 'Last 30 days', hours: 24 * 30 },
		{ label: 'All time', hours: null }
	];
	const [[agg], platforms] = await Promise.all([
		db
			.select({
				p0: playsWithin(windows[0].hours),
				s0: secondsWithin(windows[0].hours),
				p1: playsWithin(windows[1].hours),
				s1: secondsWithin(windows[1].hours),
				p2: playsWithin(windows[2].hours),
				s2: secondsWithin(windows[2].hours),
				p3: playsWithin(windows[3].hours),
				s3: secondsWithin(windows[3].hours)
			})
			.from(playHistory)
			.where(and(counted, eq(playHistory.userId, userId))),
		db
			.select({
				browser: playHistory.browser,
				os: playHistory.os,
				plays: playsCol,
				playedSeconds: secondsCol
			})
			.from(playHistory)
			.where(and(counted, eq(playHistory.userId, userId)))
			.groupBy(playHistory.browser, playHistory.os)
			.orderBy(desc(playsCol))
	]);
	const values: Record<string, number> = agg;
	return {
		row,
		windows: windows.map((w, i) => ({
			label: w.label,
			plays: values[`p${i}`] ?? 0,
			playedSeconds: values[`s${i}`] ?? 0
		})),
		platforms: platforms.map((p) => ({
			key: `${p.browser ?? ''}|${p.os ?? ''}`,
			label: [p.browser, p.os].filter(Boolean).join(' · ') || 'Unknown',
			plays: p.plays,
			playedSeconds: p.playedSeconds
		}))
	};
}

// ── libraries ───────────────────────────────────────────────────────────────

const activeFile = eq(mediaFile.status, 'active');

export const LIBRARIES_PAGE_SIZE = 8;

export interface LibraryStatsPage {
	rows: LibraryStatsRow[];
	total: number;
	page: number;
	perPage: number;
	/** Every library (the breakdown picker). */
	options: { id: string; name: string; deviceName: string }[];
	/** Across all libraries, not just this page. */
	totals: { files: number; bytes: number; durationSeconds: number; plays: number };
}

export async function libraryStats(requestedPage = 1): Promise<LibraryStatsPage> {
	const [libs, [fileTotals], [playTotals]] = await Promise.all([
		db
			.select({
				id: library.id,
				name: library.name,
				kind: library.kind,
				lastScanAt: library.lastScanAt,
				gatewayId: gateway.id,
				gatewayName: gateway.name
			})
			.from(library)
			.innerJoin(gateway, eq(gateway.id, library.gatewayId))
			.orderBy(gateway.name, library.name, library.id),
		db
			.select({
				files: count(),
				bytes: sql<number>`coalesce(sum(${mediaFile.size}), 0)::bigint`.mapWith(Number),
				durationMs: sql<number>`coalesce(sum(${mediaFile.durationMs}), 0)::bigint`.mapWith(Number)
			})
			.from(mediaFile)
			.where(activeFile),
		db
			.select({ plays: count() })
			.from(playHistory)
			.where(and(counted, isNotNull(playHistory.libraryId)))
	]);
	const pages = Math.max(1, Math.ceil(libs.length / LIBRARIES_PAGE_SIZE));
	const page = Math.min(Math.max(1, requestedPage), pages);
	const pageLibs = libs.slice((page - 1) * LIBRARIES_PAGE_SIZE, page * LIBRARIES_PAGE_SIZE);
	const base = {
		total: libs.length,
		page,
		perPage: LIBRARIES_PAGE_SIZE,
		options: libs.map((l) => ({ id: l.id, name: l.name, deviceName: l.gatewayName })),
		totals: {
			files: fileTotals.files,
			bytes: fileTotals.bytes,
			durationSeconds: fileTotals.durationMs / 1000,
			plays: playTotals.plays
		}
	};
	if (pageLibs.length === 0) return { ...base, rows: [] };

	const ids = pageLibs.map((l) => l.id);
	const [files, episodes, plays, lastPlays] = await Promise.all([
		db
			.select({
				libraryId: mediaFile.libraryId,
				files: count(),
				bytes: sql<number>`coalesce(sum(${mediaFile.size}), 0)::bigint`.mapWith(Number),
				durationMs: sql<number>`coalesce(sum(${mediaFile.durationMs}), 0)::bigint`.mapWith(Number),
				movies: sql<number>`count(distinct ${mediaFile.movieId})`.mapWith(Number)
			})
			.from(mediaFile)
			.where(and(activeFile, inArray(mediaFile.libraryId, ids)))
			.groupBy(mediaFile.libraryId),
		db
			.select({
				libraryId: mediaFile.libraryId,
				series: sql<number>`count(distinct ${episode.seriesId})`.mapWith(Number),
				seasons: sql<number>`count(distinct ${episode.seasonId})`.mapWith(Number),
				episodes: sql<number>`count(distinct ${episode.id})`.mapWith(Number)
			})
			.from(mediaFile)
			.innerJoin(episode, eq(episode.id, mediaFile.episodeId))
			.where(and(activeFile, inArray(mediaFile.libraryId, ids)))
			.groupBy(mediaFile.libraryId),
		db
			.select({ libraryId: playHistory.libraryId, plays: playsCol })
			.from(playHistory)
			.where(and(counted, inArray(playHistory.libraryId, ids)))
			.groupBy(playHistory.libraryId),
		db
			.selectDistinctOn([playHistory.libraryId], {
				libraryId: playHistory.libraryId,
				...titleColumns,
				startedAt: playHistory.startedAt
			})
			.from(playHistory)
			.leftJoin(movie, eq(movie.id, playHistory.movieId))
			.leftJoin(series, eq(series.id, playHistory.seriesId))
			.leftJoin(episode, eq(episode.id, playHistory.episodeId))
			.where(and(counted, inArray(playHistory.libraryId, ids)))
			.orderBy(playHistory.libraryId, desc(playHistory.startedAt))
	]);
	const fileBy = new Map(files.map((f) => [f.libraryId, f]));
	const epBy = new Map(episodes.map((e) => [e.libraryId, e]));
	const playBy = new Map(plays.map((p) => [p.libraryId, p.plays]));
	const lastBy = new Map(lastPlays.map((l) => [l.libraryId, l]));
	const rows = pageLibs.map((lib): LibraryStatsRow => {
		const f = fileBy.get(lib.id);
		const e = epBy.get(lib.id);
		const last = lastBy.get(lib.id);
		return {
			id: lib.id,
			name: lib.name,
			kind: lib.kind,
			device: {
				id: lib.gatewayId,
				name: lib.gatewayName,
				online: registry.isOnline(lib.gatewayId)
			},
			titles: lib.kind === 'movie' ? (f?.movies ?? 0) : (e?.series ?? 0),
			seasons: e?.seasons ?? 0,
			episodes: e?.episodes ?? 0,
			files: f?.files ?? 0,
			bytes: f?.bytes ?? 0,
			durationSeconds: (f?.durationMs ?? 0) / 1000,
			lastScanAt: lib.lastScanAt?.toISOString() ?? null,
			plays: playBy.get(lib.id) ?? 0,
			lastPlayed: last ? { title: toPlayTitle(last), at: last.startedAt.toISOString() } : null
		};
	});
	return { ...base, rows };
}

function foldBreakdown(rows: { key: string; files: number; bytes: number }[]): Breakdown[] {
	const merged = new Map<string, Breakdown>();
	for (const row of rows) {
		const entry = merged.get(row.key) ?? { label: row.key, files: 0, bytes: 0 };
		entry.files += row.files;
		entry.bytes += row.bytes;
		merged.set(row.key, entry);
	}
	return [...merged.values()].sort((a, b) => b.files - a.files);
}

export async function libraryBreakdowns(libraryId?: string): Promise<LibraryBreakdowns> {
	const where = and(activeFile, libraryId ? eq(mediaFile.libraryId, libraryId) : undefined);
	const groupBy = (column: SQL | typeof mediaFile.width) =>
		db
			.select({
				key: sql<string | number | null>`${column}`,
				files: count(),
				bytes: sql<number>`coalesce(sum(${mediaFile.size}), 0)::bigint`.mapWith(Number)
			})
			.from(mediaFile)
			.where(where)
			.groupBy(sql`1`);
	const [widths, videoCodecs, containers, audioCodecs] = await Promise.all([
		groupBy(mediaFile.width),
		groupBy(sql`lower(${mediaFile.videoCodec})`),
		groupBy(sql`lower(${mediaFile.container})`),
		groupBy(sql`lower(${mediaFile.audioCodec})`)
	]);
	const label = (key: string | number | null) => (key == null ? 'Unknown' : String(key));
	return {
		resolution: foldBreakdown(
			widths.map((w) => {
				const width = w.key == null ? null : Number(w.key);
				const res = width ? resolutionLabel(width) : 'Unknown';
				return { key: res === '2160p' ? '4K' : res, files: w.files, bytes: w.bytes };
			})
		),
		videoCodec: foldBreakdown(videoCodecs.map((r) => ({ ...r, key: label(r.key) }))),
		container: foldBreakdown(containers.map((r) => ({ ...r, key: label(r.key) }))),
		audioCodec: foldBreakdown(audioCodecs.map((r) => ({ ...r, key: label(r.key) })))
	};
}

export async function recentlyAdded(limit = 10, libraryId?: string): Promise<RecentlyAddedFile[]> {
	const rows = await db
		.select({
			id: mediaFile.id,
			createdAt: mediaFile.createdAt,
			size: mediaFile.size,
			width: mediaFile.width,
			libraryName: library.name,
			movieTitle: movie.title,
			movieYear: movie.year,
			movieSlug: movie.slug,
			moviePoster: movie.posterUrl,
			episodeTitle: episode.title,
			episodeNumber: episode.number,
			episodeSlug: episode.slug,
			seasonNumber: season.number,
			seriesTitle: series.title,
			seriesYear: series.year,
			seriesSlug: series.slug,
			seriesPoster: series.posterUrl
		})
		.from(mediaFile)
		.innerJoin(library, eq(library.id, mediaFile.libraryId))
		.leftJoin(movie, eq(movie.id, mediaFile.movieId))
		.leftJoin(episode, eq(episode.id, mediaFile.episodeId))
		.leftJoin(season, eq(season.id, episode.seasonId))
		.leftJoin(series, eq(series.id, episode.seriesId))
		.where(and(activeFile, libraryId ? eq(mediaFile.libraryId, libraryId) : undefined))
		.orderBy(desc(mediaFile.createdAt))
		.limit(limit);
	return rows
		.filter((r) => r.movieTitle !== null || r.episodeTitle !== null)
		.map((r) => ({
			id: r.id,
			title: r.movieTitle
				? {
						kind: 'movie' as const,
						title: r.movieTitle,
						seriesTitle: null,
						seasonNumber: null,
						episodeNumber: null,
						year: r.movieYear,
						slug: r.movieSlug,
						episodeSlug: null,
						posterUrl: r.moviePoster
					}
				: {
						kind: 'episode' as const,
						title: r.episodeTitle!,
						seriesTitle: r.seriesTitle,
						seasonNumber: r.seasonNumber,
						episodeNumber: r.episodeNumber,
						year: r.seriesYear,
						slug: r.seriesSlug,
						episodeSlug: r.episodeSlug,
						posterUrl: r.seriesPoster
					},
			libraryName: r.libraryName,
			addedAt: r.createdAt.toISOString(),
			bytes: r.size,
			width: r.width
		}));
}

/** Users for the history filter select. */
export async function userOptions(): Promise<{ id: string; name: string }[]> {
	return db.select({ id: user.id, name: user.name }).from(user).orderBy(user.name);
}
