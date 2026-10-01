import type { ProfileColor, ProfileIcon } from './profiles';

/**
 * Watch together: client-safe vocabulary + pure sync math shared by the hub's
 * room service (src/lib/server/together/) and the browser controller
 * (src/lib/together/session.svelte.ts).
 *
 * The hub is authoritative: a room holds where the shared timeline is and
 * whether it runs; clients send intents (play/pause/seek/media) and converge
 * their own <video> to the state the hub broadcasts.
 */

/** What the party is watching. A party never changes title — only the episode. */
export type TogetherMedia =
	{ kind: 'movie'; slug: string } | { kind: 'series'; slug: string; episodeSlug: string };

export interface TogetherState {
	/** Bumped on every change; `ready` reports name the wait they answer. */
	seq: number;
	media: TogetherMedia;
	/** The group's intent: running (possibly held by a wait) or paused. */
	playing: boolean;
	/** Held at `position` until every participant has buffered it (or the wait times out). */
	waiting: boolean;
	/** Seconds on the source timeline at `anchorAt`. */
	position: number;
	/** Hub clock (ms) at which `position` was true. */
	anchorAt: number;
	/** Participants the current wait still waits for. */
	waitingFor: string[];
}

export interface TogetherParticipant {
	id: string;
	name: string;
	avatarColor: ProfileColor;
	avatarIcon: ProfileIcon | null;
	isHost: boolean;
	/** False during the reconnect grace period. */
	connected: boolean;
}

export interface TogetherChatEntry {
	id: string;
	/** Hub clock (ms). */
	at: number;
	/** `event` = a system line ("Ana paused"); `message` = chat text. */
	kind: 'message' | 'event';
	text: string;
	/** Sender (messages) / actor (events); absent for events without one. */
	participantId?: string;
	name?: string;
}

export const TOGETHER_REACTIONS = ['😂', '😮', '😍', '😢', '👏', '🔥', '😱', '👍'] as const;
export type TogetherReaction = (typeof TOGETHER_REACTIONS)[number];

export const CHAT_MAX_LENGTH = 500;
export const MAX_PARTICIPANTS = 8;

/** Browser → hub. */
export type TogetherClientMessage =
	| { type: 'play'; position: number }
	| { type: 'pause'; position: number }
	| { type: 'seek'; position: number }
	| { type: 'ready'; seq: number }
	| { type: 'buffering'; position: number }
	| { type: 'media'; media: TogetherMedia; label: string }
	| { type: 'chat'; text: string }
	| { type: 'react'; emoji: TogetherReaction }
	| { type: 'kick'; participantId: string }
	| { type: 'end' }
	| { type: 'ping'; t0: number };

export type TogetherEndReason = 'ended' | 'kicked' | 'gone';

/** Hub → browser. */
export type TogetherServerMessage =
	| {
			type: 'welcome';
			participantId: string;
			state: TogetherState;
			participants: TogetherParticipant[];
			chat: TogetherChatEntry[];
			serverTime: number;
	  }
	| { type: 'state'; state: TogetherState; serverTime: number }
	| { type: 'participants'; participants: TogetherParticipant[] }
	| { type: 'chat'; entry: TogetherChatEntry }
	| { type: 'reaction'; participantId: string; name: string; emoji: TogetherReaction }
	| { type: 'pong'; t0: number; serverTime: number }
	| { type: 'ended'; reason: TogetherEndReason; message: string }
	| { type: 'error'; message: string };

/** WebSocket close codes the hub uses when it refuses or ends a connection. */
export const TOGETHER_CLOSE = {
	ended: 4000,
	kicked: 4003,
	gone: 4004,
	full: 4009
} as const;

/** A watch-page path carrying the party code. */
export function withParty(href: string, code: string): string {
	return `${href}${href.includes('?') ? '&' : '?'}party=${encodeURIComponent(code)}`;
}

export function sameMedia(a: TogetherMedia, b: TogetherMedia): boolean {
	if (a.kind !== b.kind || a.slug !== b.slug) return false;
	return a.kind === 'movie' || a.episodeSlug === (b as { episodeSlug: string }).episodeSlug;
}

/** Where the shared timeline is at hub time `serverNow` (ms). */
export function expectedPosition(state: TogetherState, serverNow: number): number {
	if (!state.playing || state.waiting) return state.position;
	return state.position + Math.max(0, serverNow - state.anchorAt) / 1000;
}

/** Off by more than this while playing: jump (anything less is nudged by rate). */
export const HARD_SEEK_SECONDS = 2;
/** …or by more than this when the target is already buffered (a cheap, local seek). */
export const BUFFERED_SEEK_SECONDS = 1;
/** Start nudging the playback rate past this drift… */
export const NUDGE_START_SECONDS = 0.3;
/** …and stop once back inside this. */
export const NUDGE_STOP_SECONDS = 0.1;
/** Paused / held: a frame-accurate match isn't needed, but a visible one is. */
export const PAUSED_TOLERANCE_SECONDS = 0.25;
export const NUDGE_RATE = 0.05;

export interface LocalPlayback {
	time: number;
	paused: boolean;
	rate: number;
}

export interface SyncPlan {
	seekTo: number | null;
	play: boolean;
	rate: number;
}

/**
 * How to bring the local element to the shared timeline. Small drift while
 * playing is corrected with a ±5 % rate nudge — a seek to unbuffered media on
 * an HLS transcode means fetching new segments, which costs far more than it
 * fixes. A target that is already buffered is cheap to jump to.
 */
export function planSync(
	local: LocalPlayback,
	target: { position: number; running: boolean; buffered?: boolean }
): SyncPlan {
	const diff = target.position - local.time;
	const drift = Math.abs(diff);
	if (!target.running) {
		return {
			seekTo: drift > PAUSED_TOLERANCE_SECONDS ? target.position : null,
			play: false,
			rate: 1
		};
	}
	const seekPast = target.buffered ? BUFFERED_SEEK_SECONDS : HARD_SEEK_SECONDS;
	if (drift > seekPast) return { seekTo: target.position, play: true, rate: 1 };
	const nudging = local.rate !== 1;
	if (drift > NUDGE_START_SECONDS || (nudging && drift > NUDGE_STOP_SECONDS)) {
		return { seekTo: null, play: true, rate: diff > 0 ? 1 + NUDGE_RATE : 1 - NUDGE_RATE };
	}
	return { seekTo: null, play: true, rate: 1 };
}

export interface ClockSample {
	/** Client clock when the ping left. */
	t0: number;
	/** Client clock when the pong arrived. */
	t1: number;
	serverTime: number;
}

/**
 * Hub clock minus client clock (ms), NTP-style: the sample with the shortest
 * round trip has the least asymmetric-delay error. 0 with no samples.
 */
export function clockOffset(samples: readonly ClockSample[]): number {
	let best: ClockSample | null = null;
	for (const s of samples) {
		if (s.t1 < s.t0) continue;
		if (!best || s.t1 - s.t0 < best.t1 - best.t0) best = s;
	}
	return best ? best.serverTime - (best.t0 + best.t1) / 2 : 0;
}

/** "Ana", "Ana and Ben", "Ana, Ben and 2 others". */
export function listNames(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? '';
	if (names.length === 2) return `${names[0]} and ${names[1]}`;
	if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
	return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/**
 * In a party one viewer's "skip automatically" mustn't jump the whole group:
 * auto becomes the button (pressing it is a seek, which the party shares).
 */
export function partySkipMode<T extends string>(mode: T): T | 'show' {
	return mode === 'auto' ? 'show' : mode;
}

/** A query string with `party` set to `code` (or dropped) and the one-shot `invite` removed. */
export function partySearch(search: string, code: string | null): string {
	const params = [...new URLSearchParams(search)].filter(
		([key]) => key !== 'invite' && key !== 'party'
	);
	if (code) params.push(['party', code]);
	const query = new URLSearchParams(params).toString();
	return query ? `?${query}` : '';
}
