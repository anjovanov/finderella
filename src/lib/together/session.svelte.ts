import {
	clockOffset,
	expectedPosition,
	listNames,
	planSync,
	sameMedia,
	TOGETHER_CLOSE,
	type ClockSample,
	type TogetherChatEntry,
	type TogetherClientMessage,
	type TogetherMedia,
	type TogetherParticipant,
	type TogetherReaction,
	type TogetherServerMessage,
	type TogetherState
} from '$lib/data/together';
import { requestTicket } from '$lib/together-client';

/**
 * The browser side of a watch party: one WebSocket to the hub's room, and a
 * sync loop that keeps this page's <video> on the shared timeline.
 *
 * Echo suppression is by comparison, not flags: a local play/pause/seek only
 * becomes an intent when it disagrees with the room state, and every
 * correction this class makes lands on that state — so its own corrections
 * never echo back as intents.
 *
 * Created per watch page (never module state); the page disposes it.
 */

export type TogetherStatus = 'connecting' | 'live' | 'reconnecting' | 'ended';

export interface FloatingReaction {
	id: number;
	emoji: TogetherReaction;
	name: string;
	/** Horizontal start, % of the player width. */
	x: number;
}

export interface TogetherCallbacks {
	/** The first room state arrived (the page can start its playback session). */
	onJoined?(): void;
	/** The room moved to another episode: navigate this page there. */
	onMediaChange(media: TogetherMedia): void;
	/** The party is over for this viewer (ended, removed, gone, unreachable). */
	onEnded(message: string): void;
}

/** A local `waiting` this long while the room runs counts as a stall. */
const STALL_REPORT_MS = 1_000;
/** A local seek landing further than this from the shared position is an intent. */
const SEEK_INTENT_SECONDS = 1;
const SYNC_INTERVAL_MS = 1_000;
const CLOCK_SAMPLES = 8;
const CLOCK_BURST = 5;
const CLOCK_INTERVAL_MS = 30_000;
const RECONNECT_GIVE_UP_MS = 60_000;
const NOTICE_MS = 4_000;
const REACTION_MS = 3_200;
/** HTMLMediaElement.HAVE_FUTURE_DATA */
const HAVE_FUTURE_DATA = 3;

export class TogetherSession {
	readonly code: string;

	status: TogetherStatus = $state('connecting');
	/** This tab's participant id (stable across reconnects within the grace period). */
	me: string | null = $state(null);
	participants: TogetherParticipant[] = $state.raw([]);
	chat: TogetherChatEntry[] = $state.raw([]);
	state: TogetherState | null = $state.raw(null);
	reactions: FloatingReaction[] = $state.raw([]);
	/** A transient line over the video ("Ana paused"). */
	notice: string | null = $state(null);
	/** The browser refused to start playback without a click (autoplay policy). */
	needsGesture = $state(false);
	chatOpen = $state(false);
	unread = $state(0);

	/** True once the first state arrived (the page waits for it to pick a start position). */
	joined = $derived(this.state !== null);
	isHost = $derived(this.participants.some((p) => p.id === this.me && p.isHost));
	/** Who the group is waiting for, by name (excluding this tab). */
	waitingNames = $derived.by(() => {
		const s = this.state;
		if (!s?.waiting) return [];
		return this.participants
			.filter((p) => p.id !== this.me && s.waitingFor.includes(p.id))
			.map((p) => p.name);
	});
	waitingLabel = $derived(
		this.waitingNames.length ? `Waiting for ${listNames(this.waitingNames)}…` : null
	);

	#callbacks: TogetherCallbacks;
	#ws: WebSocket | null = null;
	#disposed = false;
	#reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	#disconnectedSince: number | null = null;
	#attempt = 0;

	#clock: ClockSample[] = [];
	#offset = 0;
	#clockTimers: ReturnType<typeof setTimeout>[] = [];
	#clockInterval: ReturnType<typeof setInterval> | undefined;

	#video: HTMLVideoElement | null = null;
	/** The attached element has loaded; from here on this class corrects it. */
	#synced = false;
	/**
	 * …and has once matched the shared timeline. Only then do local events count
	 * as intents: the resume seek of a freshly mounted player (the room moved on
	 * while it loaded) must not drag everyone back.
	 */
	#armed = false;
	/** A seek this class started; its seeking/seeked events aren't the viewer's. */
	#ownSeek = false;
	#syncTimer: ReturnType<typeof setInterval> | undefined;
	#stallTimer: ReturnType<typeof setTimeout> | undefined;
	#readySentFor = -1;

	/** What this page shows (watch pages report it); compared with the room's. */
	#pageMedia: TogetherMedia | null = null;
	/** The episode the room sent us to; its arrival isn't a local change. */
	#navigatingTo: TogetherMedia | null = null;

	#noticeTimer: ReturnType<typeof setTimeout> | undefined;
	#reactionSeq = 0;

	constructor(code: string, callbacks: TogetherCallbacks) {
		this.code = code;
		this.#callbacks = callbacks;
	}

	// ---------- connection ----------

	connect(): void {
		void this.#open();
	}

	dispose(): void {
		this.#disposed = true;
		clearTimeout(this.#reconnectTimer);
		clearTimeout(this.#noticeTimer);
		this.#stopClock();
		const ws = this.#ws;
		this.#ws = null;
		ws?.close(1000, 'left');
	}

	async #open(): Promise<void> {
		if (this.#disposed) return;
		let ticket: string;
		try {
			ticket = await requestTicket(this.code, this.me);
		} catch (err) {
			const status = (err as { status?: number }).status;
			// 401/404/409: no session, no profile, or no party — retrying won't help.
			if (status && status >= 400 && status < 500) {
				this.#end((err as Error).message);
				return;
			}
			this.#scheduleReconnect();
			return;
		}
		if (this.#disposed) return;
		const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(
			`${scheme}//${location.host}/ws/together?ticket=${encodeURIComponent(ticket)}`
		);
		this.#ws = ws;
		ws.onmessage = (event) => {
			if (this.#ws !== ws) return;
			try {
				this.#onMessage(JSON.parse(event.data as string) as TogetherServerMessage);
			} catch {
				// malformed frame: ignore
			}
		};
		ws.onclose = (event) => {
			if (this.#ws !== ws) return;
			this.#ws = null;
			this.#stopClock();
			if (this.#disposed || this.status === 'ended') return;
			if (event.code === TOGETHER_CLOSE.full) {
				this.#end('This watch party is full.');
			} else if (
				event.code === TOGETHER_CLOSE.kicked ||
				event.code === TOGETHER_CLOSE.gone ||
				event.code === TOGETHER_CLOSE.ended
			) {
				this.#end(event.reason || 'This watch party has ended.');
			} else {
				this.#scheduleReconnect();
			}
		};
	}

	#scheduleReconnect(): void {
		if (this.#disposed) return;
		const now = Date.now();
		this.#disconnectedSince ??= now;
		if (now - this.#disconnectedSince > RECONNECT_GIVE_UP_MS) {
			this.#end('Lost the connection to the watch party.');
			return;
		}
		this.status = 'reconnecting';
		const delay = Math.min(8_000, 500 * 2 ** this.#attempt++);
		clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = setTimeout(() => void this.#open(), delay);
	}

	#end(message: string): void {
		if (this.status === 'ended') return;
		this.status = 'ended';
		this.dispose();
		this.#callbacks.onEnded(message);
	}

	#send(message: TogetherClientMessage): void {
		if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify(message));
	}

	#onMessage(message: TogetherServerMessage): void {
		switch (message.type) {
			case 'welcome': {
				const first = this.state === null;
				this.me = message.participantId;
				this.participants = message.participants;
				this.chat = message.chat;
				this.status = 'live';
				this.#attempt = 0;
				this.#disconnectedSince = null;
				this.#adoptClock(message.serverTime);
				this.#startClock();
				this.#applyState(message.state);
				if (first) this.#callbacks.onJoined?.();
				return;
			}
			case 'state':
				this.#applyState(message.state);
				return;
			case 'participants':
				this.participants = message.participants;
				return;
			case 'chat':
				this.chat = [...this.chat, message.entry].slice(-200);
				if (message.entry.participantId === this.me) return;
				if (message.entry.kind === 'event') this.#flash(message.entry.text);
				else if (!this.chatOpen) this.unread++;
				return;
			case 'reaction':
				this.#float(message.emoji, message.name);
				return;
			case 'pong':
				this.#clock = [
					...this.#clock,
					{ t0: message.t0, t1: Date.now(), serverTime: message.serverTime }
				].slice(-CLOCK_SAMPLES);
				this.#offset = clockOffset(this.#clock);
				return;
			case 'ended':
				this.#end(message.message);
				return;
			case 'error':
				this.#flash(message.message);
				return;
		}
	}

	// ---------- clock ----------

	/** Until pongs arrive, assume the welcome left the hub just now. */
	#adoptClock(serverTime: number): void {
		if (this.#clock.length === 0) this.#offset = serverTime - Date.now();
	}

	#startClock(): void {
		this.#stopClock();
		for (let i = 0; i < CLOCK_BURST; i++) {
			this.#clockTimers.push(setTimeout(() => this.#ping(), i * 400));
		}
		this.#clockInterval = setInterval(() => this.#ping(), CLOCK_INTERVAL_MS);
	}

	#stopClock(): void {
		for (const t of this.#clockTimers) clearTimeout(t);
		this.#clockTimers = [];
		clearInterval(this.#clockInterval);
	}

	#ping(): void {
		this.#send({ type: 'ping', t0: Date.now() });
	}

	#serverNow(): number {
		return Date.now() + this.#offset;
	}

	/** Where the shared timeline is right now (start position for a new playback session). */
	positionNow(): number {
		return this.state ? expectedPosition(this.state, this.#serverNow()) : 0;
	}

	// ---------- room state ----------

	#applyState(next: TogetherState): void {
		const previous = this.state;
		this.state = next;
		if (!previous || !sameMedia(previous.media, next.media)) this.#followMedia();
		this.#sync();
	}

	/** Watch pages report what they show; a difference from the room is a local navigation. */
	setPageMedia(media: TogetherMedia, label: string): void {
		this.#pageMedia = media;
		const room = this.state?.media;
		// Before the first state the room wins (we're joining it), see #followMedia.
		if (!room || sameMedia(room, media)) {
			this.#navigatingTo = null;
			return;
		}
		if (this.#navigatingTo && sameMedia(this.#navigatingTo, media)) return;
		this.#navigatingTo = null;
		this.#send({ type: 'media', media, label });
		// Optimistic: the page is already there; the hub's state confirms it.
		this.state = { ...this.state!, media, playing: true, waiting: true, position: 0 };
	}

	#followMedia(): void {
		const room = this.state?.media;
		if (!room || !this.#pageMedia || sameMedia(room, this.#pageMedia)) return;
		if (this.#navigatingTo && sameMedia(this.#navigatingTo, room)) return;
		this.#navigatingTo = room;
		this.#callbacks.onMediaChange(room);
	}

	// ---------- video ----------

	/** `{@attach}` target for the player's <video>; re-runs per element (each session remount). */
	attach = (video: HTMLVideoElement): (() => void) => {
		this.#video = video;
		this.#synced = false;
		this.#armed = false;
		this.#ownSeek = false;
		this.#readySentFor = -1;

		const onCanPlay = () => {
			if (!this.#synced) {
				this.#synced = true;
				this.#sync();
			}
			this.#maybeReady();
		};
		const onPlay = () => {
			if (!this.#armed) return;
			const s = this.state;
			if (s && !s.playing) {
				this.#intent({ type: 'play', position: video.currentTime });
			} else {
				// Pressed play while the group is held: the next sync pauses it again.
				this.#sync();
			}
		};
		const onPlaying = () => {
			this.needsGesture = false;
			clearTimeout(this.#stallTimer);
		};
		const onPause = () => {
			if (!this.#armed || video.ended) return;
			const s = this.state;
			if (s?.playing && !s.waiting) this.#intent({ type: 'pause', position: video.currentTime });
		};
		// `seeking` (not `seeked`): currentTime already holds the target, and a slow
		// HLS seek would otherwise read as drift and be corrected mid-drag.
		const onSeeking = () => {
			if (!this.#armed || this.#ownSeek || !this.state) return;
			const shared = expectedPosition(this.state, this.#serverNow());
			if (Math.abs(video.currentTime - shared) > SEEK_INTENT_SECONDS) {
				this.#intent({ type: 'seek', position: video.currentTime });
			}
		};
		const onSeeked = () => {
			this.#ownSeek = false;
			this.#maybeArm();
			this.#maybeReady();
		};
		const onWaiting = () => {
			clearTimeout(this.#stallTimer);
			this.#stallTimer = setTimeout(() => {
				const s = this.state;
				if (!this.#synced || !s?.playing || s.waiting) return;
				if (video.paused || video.readyState >= HAVE_FUTURE_DATA) return;
				this.#send({ type: 'buffering', position: video.currentTime });
			}, STALL_REPORT_MS);
		};

		video.addEventListener('canplay', onCanPlay);
		video.addEventListener('play', onPlay);
		video.addEventListener('playing', onPlaying);
		video.addEventListener('pause', onPause);
		video.addEventListener('seeking', onSeeking);
		video.addEventListener('seeked', onSeeked);
		video.addEventListener('waiting', onWaiting);
		clearInterval(this.#syncTimer);
		this.#syncTimer = setInterval(() => this.#sync(), SYNC_INTERVAL_MS);
		if (video.readyState >= HAVE_FUTURE_DATA) onCanPlay();

		return () => {
			video.removeEventListener('canplay', onCanPlay);
			video.removeEventListener('play', onPlay);
			video.removeEventListener('playing', onPlaying);
			video.removeEventListener('pause', onPause);
			video.removeEventListener('seeking', onSeeking);
			video.removeEventListener('seeked', onSeeked);
			video.removeEventListener('waiting', onWaiting);
			clearInterval(this.#syncTimer);
			clearTimeout(this.#stallTimer);
			if (this.#video === video) {
				this.#video = null;
				this.#synced = false;
			}
		};
	};

	/**
	 * Send an intent and apply its expected outcome locally right away, so the
	 * 1 s sync tick can't undo the viewer's action before the hub answers.
	 */
	#intent(message: Extract<TogetherClientMessage, { position: number }>): void {
		const s = this.state;
		if (!s) return;
		this.#send(message);
		const now = this.#serverNow();
		if (message.type === 'pause') {
			this.state = {
				...s,
				playing: false,
				waiting: false,
				position: message.position,
				anchorAt: now
			};
		} else if (message.type === 'play' || s.playing) {
			// play, or a seek while running: the hub holds everyone at the target.
			this.state = {
				...s,
				playing: true,
				waiting: true,
				position: message.position,
				anchorAt: now
			};
		} else {
			this.state = { ...s, position: message.position, anchorAt: now };
		}
		this.#sync();
	}

	/** Converge the element to the room state. */
	#sync(): void {
		const video = this.#video;
		const s = this.state;
		if (!video || !s || !this.#synced) return;
		const running = s.playing && !s.waiting;
		// Mid-seek (ours or a slider drag): let it land before judging drift, but
		// hold still if the group is held or paused.
		if (video.seeking) {
			if (!running && !video.paused) video.pause();
			return;
		}
		const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
		const position = Math.min(expectedPosition(s, this.#serverNow()), duration);
		// The movie's over for everyone at about the same time; don't rewind into it.
		if (video.ended && position >= duration - 1) return;
		const plan = planSync(
			{ time: video.currentTime, paused: video.paused, rate: video.playbackRate },
			{ position, running, buffered: isBuffered(video, position) }
		);
		if (plan.seekTo !== null) {
			this.#ownSeek = true;
			video.currentTime = plan.seekTo;
		}
		if (video.playbackRate !== plan.rate) video.playbackRate = plan.rate;
		if (plan.play && video.paused) {
			video.play().then(
				() => (this.needsGesture = false),
				(err: DOMException) => {
					if (err?.name === 'NotAllowedError') this.needsGesture = true;
				}
			);
		} else if (!plan.play && !video.paused) {
			video.pause();
		}
		this.#maybeArm();
		this.#maybeReady();
	}

	#maybeArm(): void {
		const video = this.#video;
		const s = this.state;
		if (this.#armed || !video || !s || !this.#synced || video.seeking) return;
		const shared = expectedPosition(s, this.#serverNow());
		if (Math.abs(video.currentTime - shared) <= SEEK_INTENT_SECONDS) this.#armed = true;
	}

	/** Tell the hub this element has buffered the held position. */
	#maybeReady(): void {
		const video = this.#video;
		const s = this.state;
		if (!video || !s?.waiting || !this.#synced) return;
		if (this.#readySentFor === s.seq) return;
		if (video.seeking || video.readyState < HAVE_FUTURE_DATA) return;
		if (Math.abs(video.currentTime - s.position) > 0.5) return;
		this.#readySentFor = s.seq;
		this.#send({ type: 'ready', seq: s.seq });
	}

	/** The "Join playback" button: a real click lets the browser start the video. */
	resumeWithGesture(): void {
		this.needsGesture = false;
		this.#video?.play().catch(() => (this.needsGesture = true));
	}

	// ---------- people & chat ----------

	sendChat(text: string): void {
		const trimmed = text.trim();
		if (trimmed) this.#send({ type: 'chat', text: trimmed });
	}

	react(emoji: TogetherReaction): void {
		this.#send({ type: 'react', emoji });
	}

	kick(participantId: string): void {
		this.#send({ type: 'kick', participantId });
	}

	/** Host only: end the party for everyone. */
	endForEveryone(): void {
		this.#send({ type: 'end' });
	}

	setChatOpen(open: boolean): void {
		this.chatOpen = open;
		if (open) this.unread = 0;
	}

	#flash(text: string): void {
		this.notice = text;
		clearTimeout(this.#noticeTimer);
		this.#noticeTimer = setTimeout(() => (this.notice = null), NOTICE_MS);
	}

	#float(emoji: TogetherReaction, name: string): void {
		const reaction: FloatingReaction = {
			id: ++this.#reactionSeq,
			emoji,
			name,
			x: 8 + Math.random() * 20
		};
		this.reactions = [...this.reactions, reaction].slice(-30);
		setTimeout(() => {
			this.reactions = this.reactions.filter((r) => r.id !== reaction.id);
		}, REACTION_MS);
	}
}

/** `position` lies inside the element's buffered ranges (with a little room to play on). */
function isBuffered(video: HTMLVideoElement, position: number): boolean {
	const ranges = video.buffered;
	for (let i = 0; i < ranges.length; i++) {
		if (position >= ranges.start(i) && position + 0.5 <= ranges.end(i)) return true;
	}
	return false;
}
