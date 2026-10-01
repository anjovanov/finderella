import { randomUUID } from 'node:crypto';
import { formatDurationUnits } from '$lib/data/time';
import {
	CHAT_MAX_LENGTH,
	MAX_PARTICIPANTS,
	sameMedia,
	TOGETHER_CLOSE,
	type TogetherChatEntry,
	type TogetherClientMessage,
	type TogetherEndReason,
	type TogetherMedia,
	type TogetherParticipant,
	type TogetherServerMessage,
	type TogetherState
} from '$lib/data/together';
import type { ProfileColor, ProfileIcon } from '$lib/data/profiles';

/**
 * One watch party: the shared timeline, who's in it, and the chat. Pure apart
 * from the injected clock and each participant's `send`/`close`, so the whole
 * state machine is unit-tested (room.test.ts). Timeouts are evaluated by
 * `tick()`, which the RoomManager calls every second.
 *
 * Waits: starting (play), jumping (seek) and changing episode hold the group
 * at the target until every connected participant reports `ready` for that
 * `seq` — or WAIT_TIMEOUT_MS passes, after which stragglers are marked lagging
 * and catch up on their own. A participant who stalls mid-play holds the group
 * the same way, but can't do so again while lagging.
 */

export const WAIT_TIMEOUT_MS = 8_000;
export const STALL_TIMEOUT_MS = 10_000;
export const LAGGING_MS = 30_000;
/** A dropped connection keeps its seat this long (reloads, network blips). */
export const RECONNECT_GRACE_MS = 15_000;
export const CHAT_HISTORY = 100;
export const RATE_WINDOW_MS = 5_000;
export const CHAT_RATE = 5;
export const REACTION_RATE = 8;
export const LABEL_MAX_LENGTH = 120;

export interface TogetherIdentity {
	userId: string;
	profileId: string;
	name: string;
	avatarColor: ProfileColor;
	avatarIcon: ProfileIcon | null;
}

export interface Connection {
	send(message: TogetherServerMessage): void;
	close(code: number, reason: string): void;
}

interface Participant extends TogetherIdentity {
	id: string;
	joinedAt: number;
	connection: Connection | null;
	disconnectedAt: number | null;
	laggingUntil: number;
	chatTimes: number[];
	reactionTimes: number[];
}

export type JoinResult =
	{ ok: true; participantId: string } | { ok: false; reason: 'full' | 'kicked' | 'ended' };

export class Room {
	readonly code: string;
	readonly ownerUserId: string;
	readonly createdAt: number;
	#now: () => number;
	#participants = new Map<string, Participant>();
	#hostId: string | null = null;
	#kickedProfiles = new Set<string>();
	#chat: TogetherChatEntry[] = [];
	#state: TogetherState;
	#readyFor = new Set<string>();
	#waitDeadline = 0;
	#ended = false;
	/** Last time anyone was connected (the manager reaps long-empty rooms). */
	lastOccupiedAt: number;

	constructor(
		code: string,
		owner: TogetherIdentity,
		media: TogetherMedia,
		position: number,
		playing: boolean,
		now: () => number = Date.now
	) {
		this.code = code;
		this.ownerUserId = owner.userId;
		this.#now = now;
		this.createdAt = now();
		this.lastOccupiedAt = this.createdAt;
		this.#state = {
			seq: 1,
			media,
			// Running from the start only when a solo viewing becomes a party.
			playing,
			waiting: false,
			position: clampPosition(position),
			anchorAt: this.createdAt,
			waitingFor: []
		};
	}

	get ended(): boolean {
		return this.#ended;
	}

	get state(): TogetherState {
		return this.#state;
	}

	get media(): TogetherMedia {
		return this.#state.media;
	}

	get connectedCount(): number {
		let n = 0;
		for (const p of this.#participants.values()) if (p.connection) n++;
		return n;
	}

	/**
	 * Seat a connection. `resumeId` re-attaches a seat still in its grace period
	 * (same profile only), silently — no "joined" line for a reload.
	 */
	join(identity: TogetherIdentity, connection: Connection, resumeId?: string | null): JoinResult {
		if (this.#ended) return { ok: false, reason: 'ended' };
		if (this.#kickedProfiles.has(identity.profileId)) return { ok: false, reason: 'kicked' };
		const now = this.#now();

		const resumed = resumeId ? this.#participants.get(resumeId) : undefined;
		if (resumed && resumed.profileId === identity.profileId) {
			// A second tab taking over the seat closes the first.
			resumed.connection?.close(TOGETHER_CLOSE.ended, 'Opened in another window.');
			resumed.connection = connection;
			resumed.disconnectedAt = null;
			resumed.name = identity.name;
			resumed.avatarColor = identity.avatarColor;
			resumed.avatarIcon = identity.avatarIcon;
			this.lastOccupiedAt = now;
			this.#welcome(resumed);
			this.#broadcastParticipants();
			return { ok: true, participantId: resumed.id };
		}

		if (this.#participants.size >= MAX_PARTICIPANTS) return { ok: false, reason: 'full' };
		const participant: Participant = {
			...identity,
			id: randomUUID(),
			joinedAt: now,
			connection,
			disconnectedAt: null,
			laggingUntil: 0,
			chatTimes: [],
			reactionTimes: []
		};
		this.#participants.set(participant.id, participant);
		this.#hostId ??= participant.id;
		this.lastOccupiedAt = now;
		this.#welcome(participant);
		this.#broadcastParticipants();
		this.#event(`${participant.name} joined`, participant);
		return { ok: true, participantId: participant.id };
	}

	/** The socket closed: keep the seat for RECONNECT_GRACE_MS. */
	disconnect(participantId: string, connection: Connection): void {
		const p = this.#participants.get(participantId);
		// A seat already taken over by a newer connection isn't this socket's to drop.
		if (!p || p.connection !== connection) return;
		p.connection = null;
		p.disconnectedAt = this.#now();
		this.#broadcastParticipants();
		if (this.#state.waiting) this.#maybeStart();
	}

	/** Left on purpose (Leave, Back): no grace period. */
	leave(participantId: string, connection: Connection): void {
		const p = this.#participants.get(participantId);
		if (!p || p.connection !== connection) return;
		this.#remove(p);
	}

	handle(participantId: string, message: TogetherClientMessage): void {
		const p = this.#participants.get(participantId);
		if (!p || !p.connection || this.#ended) return;
		switch (message.type) {
			case 'play':
				return this.#play(p, message.position);
			case 'pause':
				return this.#pause(p, message.position);
			case 'seek':
				return this.#seek(p, message.position);
			case 'ready':
				return this.#ready(p, message.seq);
			case 'buffering':
				return this.#buffering(p, message.position);
			case 'media':
				return this.#changeMedia(p, message.media, message.label);
			case 'chat':
				return this.#chatMessage(p, message.text);
			case 'react':
				if (!this.#allow(p.reactionTimes, REACTION_RATE)) return;
				return this.#broadcast({
					type: 'reaction',
					participantId: p.id,
					name: p.name,
					emoji: message.emoji
				});
			case 'kick':
				return this.#kick(p, message.participantId);
			case 'end':
				if (p.id === this.#hostId) this.end('ended', `${p.name} ended the watch party.`);
				return;
			case 'ping':
				return p.connection.send({ type: 'pong', t0: message.t0, serverTime: this.#now() });
		}
	}

	/** Timeouts: wait deadlines and expired reconnect grace periods. */
	tick(): void {
		if (this.#ended) return;
		const now = this.#now();
		for (const p of [...this.#participants.values()]) {
			if (p.connection || p.disconnectedAt === null) continue;
			if (now - p.disconnectedAt < RECONNECT_GRACE_MS) continue;
			this.#remove(p);
		}
		if (this.connectedCount > 0) this.lastOccupiedAt = now;

		if (this.#state.waiting && now >= this.#waitDeadline) {
			// Whoever still isn't ready stops holding the group back for a while.
			for (const id of this.#state.waitingFor) {
				const p = this.#participants.get(id);
				if (p) p.laggingUntil = now + LAGGING_MS;
			}
			this.#start();
		}
	}

	/** End the party for everyone (host action, or the manager reaping it). */
	end(reason: TogetherEndReason, message: string): void {
		if (this.#ended) return;
		this.#ended = true;
		for (const p of this.#participants.values()) {
			p.connection?.send({ type: 'ended', reason, message });
			p.connection?.close(TOGETHER_CLOSE[reason], message);
			p.connection = null;
		}
	}

	// ---------- intents ----------

	#play(p: Participant, position: number): void {
		// Already running (or about to): a stale or echoed play.
		if (this.#state.playing) return;
		this.#beginWait(position, null);
		this.#event(`${p.name} pressed play`, p);
	}

	#pause(p: Participant, position: number): void {
		if (!this.#state.playing) return;
		this.#update({
			playing: false,
			waiting: false,
			position: clampPosition(position),
			waitingFor: []
		});
		this.#event(`${p.name} paused`, p);
	}

	#seek(p: Participant, position: number): void {
		const target = clampPosition(position);
		if (this.#state.playing) {
			this.#beginWait(target, null);
		} else {
			this.#update({ position: target, anchorAt: this.#now() });
		}
		this.#event(`${p.name} jumped to ${formatDurationUnits(target)}`, p);
	}

	#ready(p: Participant, seq: number): void {
		if (!this.#state.waiting || seq !== this.#state.seq) return;
		this.#readyFor.add(p.id);
		this.#maybeStart();
	}

	#buffering(p: Participant, position: number): void {
		const s = this.#state;
		if (!s.playing || s.waiting) return;
		if (p.laggingUntil > this.#now()) return;
		this.#beginWait(position, p.id);
	}

	#changeMedia(p: Participant, media: TogetherMedia, label: string): void {
		const current = this.#state.media;
		// A party stays on its title; only a series' episode can change.
		if (media.kind !== current.kind || media.slug !== current.slug) return;
		if (sameMedia(media, current)) return;
		this.#state = { ...this.#state, media };
		this.#beginWait(0, null);
		const what = label.trim().slice(0, LABEL_MAX_LENGTH);
		this.#event(what ? `${p.name} started ${what}` : `${p.name} changed the episode`, p);
	}

	#chatMessage(p: Participant, raw: string): void {
		const text = raw.trim().slice(0, CHAT_MAX_LENGTH);
		if (!text) return;
		if (!this.#allow(p.chatTimes, CHAT_RATE)) {
			p.connection?.send({ type: 'error', message: 'Slow down a little.' });
			return;
		}
		this.#pushChat({ kind: 'message', text, participantId: p.id, name: p.name });
	}

	#kick(p: Participant, targetId: string): void {
		if (p.id !== this.#hostId || targetId === p.id) return;
		const target = this.#participants.get(targetId);
		if (!target) return;
		this.#kickedProfiles.add(target.profileId);
		this.#participants.delete(target.id);
		const message = `${p.name} removed you from the watch party.`;
		target.connection?.send({ type: 'ended', reason: 'kicked', message });
		target.connection?.close(TOGETHER_CLOSE.kicked, message);
		this.#broadcastParticipants();
		this.#event(`${target.name} was removed`, p);
		if (this.#state.waiting) this.#maybeStart();
	}

	// ---------- timeline ----------

	#beginWait(position: number, stalledBy: string | null): void {
		const now = this.#now();
		this.#readyFor = new Set();
		// A stall gets longer: the stalled device has to refill, not just seek.
		this.#waitDeadline = now + (stalledBy ? STALL_TIMEOUT_MS : WAIT_TIMEOUT_MS);
		this.#update({
			playing: true,
			waiting: true,
			position: clampPosition(position),
			anchorAt: now,
			waitingFor: this.#required()
		});
	}

	/** Connected participants a wait holds for (lagging ones are skipped). */
	#required(): string[] {
		const now = this.#now();
		const ids: string[] = [];
		for (const p of this.#participants.values()) {
			if (p.connection && p.laggingUntil <= now) ids.push(p.id);
		}
		return ids;
	}

	#maybeStart(): void {
		const pending = this.#required().filter((id) => !this.#readyFor.has(id));
		if (pending.length === 0) {
			this.#start();
			return;
		}
		if (!sameIds(pending, this.#state.waitingFor)) this.#update({ waitingFor: pending }, false);
	}

	#start(): void {
		this.#readyFor = new Set();
		this.#update({ waiting: false, anchorAt: this.#now(), waitingFor: [] });
	}

	/** Apply + broadcast. `bump` = false re-sends the same wait with a new waitingFor. */
	#update(patch: Partial<TogetherState>, bump = true): void {
		this.#state = { ...this.#state, ...patch, seq: this.#state.seq + (bump ? 1 : 0) };
		this.#broadcast({ type: 'state', state: this.#state, serverTime: this.#now() });
	}

	// ---------- people & feed ----------

	/**
	 * A seat is gone for good. The last one ends the party: its link stops
	 * working rather than letting the next visitor take over an empty room.
	 * Seats in their reconnect grace still count, so a reload keeps it alive.
	 */
	#remove(p: Participant): void {
		this.#participants.delete(p.id);
		p.connection = null;
		if (this.#participants.size === 0) {
			this.end('gone', 'This watch party has ended.');
			return;
		}
		this.#event(`${p.name} left`, p);
		if (p.id === this.#hostId) this.#handOffHost();
		this.#broadcastParticipants();
		if (this.#state.waiting) this.#maybeStart();
	}

	#handOffHost(): void {
		const next = [...this.#participants.values()]
			.filter((p) => p.connection)
			.sort((a, b) => a.joinedAt - b.joinedAt)[0];
		this.#hostId = next?.id ?? [...this.#participants.keys()][0] ?? null;
		const host = this.#hostId ? this.#participants.get(this.#hostId) : undefined;
		if (host) this.#event(`${host.name} is now the host`, host);
	}

	#welcome(p: Participant): void {
		p.connection?.send({
			type: 'welcome',
			participantId: p.id,
			state: this.#state,
			participants: this.#publicParticipants(),
			chat: this.#chat,
			serverTime: this.#now()
		});
	}

	#publicParticipants(): TogetherParticipant[] {
		return [...this.#participants.values()].map((p) => ({
			id: p.id,
			name: p.name,
			avatarColor: p.avatarColor,
			avatarIcon: p.avatarIcon,
			isHost: p.id === this.#hostId,
			connected: p.connection !== null
		}));
	}

	#broadcastParticipants(): void {
		this.#broadcast({ type: 'participants', participants: this.#publicParticipants() });
	}

	#event(text: string, actor?: Participant): void {
		this.#pushChat({ kind: 'event', text, participantId: actor?.id, name: actor?.name });
	}

	#pushChat(entry: Omit<TogetherChatEntry, 'id' | 'at'>): void {
		const full: TogetherChatEntry = { ...entry, id: randomUUID(), at: this.#now() };
		this.#chat.push(full);
		if (this.#chat.length > CHAT_HISTORY) this.#chat.splice(0, this.#chat.length - CHAT_HISTORY);
		this.#broadcast({ type: 'chat', entry: full });
	}

	#broadcast(message: TogetherServerMessage): void {
		for (const p of this.#participants.values()) p.connection?.send(message);
	}

	/** Sliding-window rate limit; records the attempt when allowed. */
	#allow(times: number[], limit: number): boolean {
		const now = this.#now();
		while (times.length && now - times[0] > RATE_WINDOW_MS) times.shift();
		if (times.length >= limit) return false;
		times.push(now);
		return true;
	}
}

function clampPosition(position: number): number {
	return Number.isFinite(position) && position > 0 ? position : 0;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}
