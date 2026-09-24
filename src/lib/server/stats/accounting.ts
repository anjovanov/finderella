import type { PlayerState } from '$lib/data/stats';

/**
 * Pure bookkeeping for watch history (no DB): playing/paused time from player
 * heartbeats, the "same viewing" rule, and a throughput meter. Tested in
 * accounting.test.ts; the DB side is ./plays.ts.
 */

/** The player sends a heartbeat every 10 s; a longer gap (frozen tab, reap) only counts this much. */
export const MAX_BEAT_GAP_MS = 25_000;
/** A new session continues the viewer's history row for the same title within this window. */
export const CONTINUE_WINDOW_MS = 10 * 60_000;

export interface LivePlay {
	state: PlayerState;
	positionSeconds: number;
	durationSeconds: number | null;
	subtitleTrackId: string | null;
	lastBeatAt: number | null;
	beats: number;
	/** Seconds accumulated by this session (history rows add these as increments). */
	played: number;
	paused: number;
}

export interface Heartbeat {
	state: PlayerState;
	positionSeconds: number;
	durationSeconds: number | null;
	subtitleTrackId?: string | null;
}

export function newLivePlay(startSeconds: number): LivePlay {
	return {
		state: 'unknown',
		positionSeconds: startSeconds,
		durationSeconds: null,
		subtitleTrackId: null,
		lastBeatAt: null,
		beats: 0,
		played: 0,
		paused: 0
	};
}

/** Credit the time since the previous beat to the state the player was in, capped at MAX_BEAT_GAP_MS. */
function credit(live: LivePlay, now: number): Pick<LivePlay, 'played' | 'paused'> {
	if (live.lastBeatAt === null) return { played: live.played, paused: live.paused };
	const seconds = Math.max(0, Math.min(now - live.lastBeatAt, MAX_BEAT_GAP_MS)) / 1000;
	return {
		played: live.played + (live.state === 'playing' ? seconds : 0),
		paused: live.paused + (live.state === 'paused' ? seconds : 0)
	};
}

export function accumulate(live: LivePlay, beat: Heartbeat, now: number): LivePlay {
	return {
		...credit(live, now),
		state: beat.state,
		positionSeconds: beat.positionSeconds,
		durationSeconds: beat.durationSeconds ?? live.durationSeconds,
		subtitleTrackId:
			beat.subtitleTrackId === undefined ? live.subtitleTrackId : beat.subtitleTrackId,
		lastBeatAt: now,
		beats: live.beats + 1
	};
}

/**
 * Close the books for a session. A viewer-initiated stop credits the tail
 * since the last beat; an idle reap doesn't (the tab went away at some point
 * during that gap). A session that never sent a beat (a cached pre-heartbeat
 * client) counts its whole lifetime as playing time.
 */
export function settle(
	live: LivePlay,
	now: number,
	opts: { creditTail: boolean; createdAt: number; lastAccessAt: number }
): LivePlay {
	if (live.beats === 0) {
		return { ...live, played: Math.max(0, opts.lastAccessAt - opts.createdAt) / 1000 };
	}
	if (!opts.creditTail) return live;
	return { ...live, ...credit(live, now), lastBeatAt: now };
}

export interface PlayIdentity {
	userId: string | null;
	userAgent: string | null;
	movieId: string | null;
	episodeId: string | null;
}

/**
 * A new session continues an existing history row when it is the same viewer
 * (guests: the same browser) watching the same movie/episode, and the row was
 * active recently — quality/audio switches, reloads, a device reconnecting.
 */
export function canContinuePlay(
	row: PlayIdentity & { lastActiveAt: Date },
	next: PlayIdentity,
	now: number
): boolean {
	if (row.userId !== next.userId) return false;
	if (row.userId === null && row.userAgent !== next.userAgent) return false;
	const sameTitle = next.movieId
		? row.movieId === next.movieId
		: next.episodeId !== null && row.episodeId === next.episodeId;
	if (!sameTitle) return false;
	return now - row.lastActiveAt.getTime() <= CONTINUE_WINDOW_MS;
}

/** Throughput over ~5 s windows; reads 0 once nothing has flowed for a while. */
export class RateMeter {
	static WINDOW_MS = 5_000;
	#windowStart: number;
	#windowBytes = 0;
	#rateBps = 0;
	#lastByteAt = 0;

	constructor(now: number) {
		this.#windowStart = now;
	}

	add(bytes: number, now: number): void {
		this.#roll(now);
		this.#windowBytes += bytes;
		this.#lastByteAt = now;
	}

	/** Bits per second. */
	read(now: number): number {
		this.#roll(now);
		return now - this.#lastByteAt > RateMeter.WINDOW_MS * 2 ? 0 : this.#rateBps;
	}

	#roll(now: number): void {
		const elapsed = now - this.#windowStart;
		if (elapsed < RateMeter.WINDOW_MS) return;
		this.#rateBps = (this.#windowBytes * 8) / (elapsed / 1000);
		this.#windowBytes = 0;
		this.#windowStart = now;
	}
}
