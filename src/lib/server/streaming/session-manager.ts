import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { playbackSession } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import {
	accumulate,
	newLivePlay,
	RateMeter,
	settle,
	type Heartbeat,
	type LivePlay
} from '$lib/server/stats/accounting';
import {
	closeOrphanPlays,
	closePlay,
	flushPlay,
	FLUSH_EVERY_MS,
	openPlay
} from '$lib/server/stats/plays';
import { parseUserAgent, type ParsedUserAgent } from '$lib/server/stats/user-agent';
import type { TrickplayGeometry } from '@finderella/protocol';
import type { PlayableSource } from './source-picker';
import type { QualityId } from '$lib/playback-quality';

export type StopReason = 'client' | 'idle' | 'error' | 'admin';

/** What the activity monitor shows about the stream beyond mode/quality. */
export interface StreamDetails {
	/** Label of the audio stream being played ("English (5.1)"). */
	audioLabel?: string | null;
	/** HLS: output channels of the transcode. */
	audioChannels?: number;
	/** HLS: the transcode's width cap (source width when uncapped). */
	streamWidth?: number | null;
}

export interface StartOptions {
	/** HLS: the audio bitrate the gateway encodes. */
	audioKbps?: number;
	startSeconds?: number;
	userAgent?: string | null;
	details?: StreamDetails;
}

export interface HotSession {
	id: string;
	/** null for a guest viewer (public access mode). */
	userId: string | null;
	source: PlayableSource;
	mode: 'direct' | 'hls';
	quality: QualityId;
	/** HLS: the audio bitrate the gateway encodes (the rung's stereo budget scaled by channel count). */
	audioKbps?: number;
	startSeconds: number;
	userAgent: string | null;
	platform: ParsedUserAgent;
	details: StreamDetails;
	createdAt: number;
	lastAccessAt: number;
	lastPersistedAt: number;
	/** Sprite-sheet layout for seek-bar thumbnails; unset when the device can't make them. */
	trickplay?: TrickplayGeometry;
	/** Watch-history row this session feeds ($lib/server/stats/plays); null until opened / for unlinked files. */
	historyId: string | null;
	/** Player state from heartbeats. */
	live: LivePlay;
	/** What flushPlay has already written to the history row. */
	flushed: { played: number; paused: number; bytes: number };
	lastFlushAt: number;
	/** Media bytes proxied to the viewer (range/segment bodies). */
	bytesSent: number;
	rate: RateMeter;
	/** Set by an admin "Stop stream"; the next heartbeat tells the player and ends the session. */
	terminateMessage?: string;
}

const IDLE_TIMEOUT_MS = 60_000;
const REAPER_INTERVAL_MS = 30_000;
const PERSIST_ACCESS_EVERY_MS = 30_000;
/** A player that never heartbeats again (frozen tab, pre-heartbeat client) is stopped anyway. */
const TERMINATE_FALLBACK_MS = 20_000;

/**
 * Hot playback-session state (single-process hub). The DB row mirrors it for
 * observability and boot-time orphan cleanup; the session uuid doubles as the
 * capability token in /api/stream URLs, so lookups here also authorize them.
 */
class SessionManager {
	#sessions = new Map<string, HotSession>();
	#reaper: NodeJS.Timeout | null = null;

	async start(
		userId: string | null,
		source: PlayableSource,
		mode: 'direct' | 'hls',
		quality: QualityId = 'original',
		opts: StartOptions = {}
	): Promise<HotSession> {
		const startSeconds = opts.startSeconds ?? 0;
		const [row] = await db
			.insert(playbackSession)
			.values({
				userId,
				mediaFileId: source.file.id,
				gatewayId: source.gatewayId,
				mode,
				quality,
				startSeconds
			})
			.returning({ id: playbackSession.id });
		const now = Date.now();
		const userAgent = opts.userAgent ?? null;
		const session: HotSession = {
			id: row.id,
			userId,
			source,
			mode,
			quality,
			audioKbps: opts.audioKbps,
			startSeconds,
			userAgent,
			platform: parseUserAgent(userAgent),
			details: opts.details ?? {},
			createdAt: now,
			lastAccessAt: now,
			lastPersistedAt: now,
			historyId: null,
			live: newLivePlay(startSeconds),
			flushed: { played: 0, paused: 0, bytes: 0 },
			lastFlushAt: now,
			bytesSent: 0,
			rate: new RateMeter(now)
		};
		this.#sessions.set(session.id, session);
		this.#ensureReaper();
		await openPlay(session);
		log.info(
			{ sessionId: session.id, mode, quality, relPath: source.file.relPath },
			'playback started'
		);
		return session;
	}

	get(sessionId: string): HotSession | undefined {
		return this.#sessions.get(sessionId);
	}

	/** Every live session (activity monitor). */
	list(): HotSession[] {
		return [...this.#sessions.values()];
	}

	setTrickplay(sessionId: string, geometry: TrickplayGeometry): void {
		const session = this.#sessions.get(sessionId);
		if (session) session.trickplay = geometry;
	}

	/** Record activity (segment/range fetch); throttled DB write. */
	touch(sessionId: string): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.lastAccessAt = Date.now();
		if (session.lastAccessAt - session.lastPersistedAt > PERSIST_ACCESS_EVERY_MS) {
			session.lastPersistedAt = session.lastAccessAt;
			void db
				.update(playbackSession)
				.set({ lastAccessAt: new Date(session.lastAccessAt) })
				.where(eq(playbackSession.id, sessionId))
				.catch(() => {});
		}
	}

	/** Count media bytes sent to the viewer (bandwidth column, history `bytes_sent`). */
	addBytes(sessionId: string, bytes: number): void {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		session.bytesSent += bytes;
		session.rate.add(bytes, Date.now());
	}

	/**
	 * A player heartbeat: keeps the session alive while paused (the monitor
	 * lists it) and feeds playing/paused time into its history row.
	 */
	heartbeat(sessionId: string, beat: Heartbeat): HotSession | undefined {
		const session = this.#sessions.get(sessionId);
		if (!session) return undefined;
		const now = Date.now();
		this.touch(sessionId);
		session.live = accumulate(session.live, beat, now);
		if (now - session.lastFlushAt >= FLUSH_EVERY_MS) void flushPlay(session, now);
		return session;
	}

	/** Admin "Stop stream": the player learns on its next heartbeat; stopped regardless after a grace period. */
	requestTermination(sessionId: string, message: string): boolean {
		const session = this.#sessions.get(sessionId);
		if (!session) return false;
		session.terminateMessage = message;
		setTimeout(() => void this.stop(sessionId, 'admin'), TERMINATE_FALLBACK_MS).unref?.();
		return true;
	}

	async stop(sessionId: string, reason: StopReason): Promise<void> {
		const session = this.#sessions.get(sessionId);
		if (!session) return;
		this.#sessions.delete(sessionId);
		log.info({ sessionId, reason }, 'playback stopped');
		if (session.mode === 'hls') {
			// Tell the gateway to kill ffmpeg and wipe the session temp dir.
			try {
				registry.send(session.source.gatewayId, { type: 'session.stop', sessionId });
			} catch {
				// gateway offline — it self-reaps on disconnect anyway
			}
		}
		const now = Date.now();
		session.live = settle(session.live, now, {
			creditTail: reason === 'client' || reason === 'admin',
			createdAt: session.createdAt,
			lastAccessAt: session.lastAccessAt
		});
		const shared =
			session.historyId !== null && this.list().some((s) => s.historyId === session.historyId);
		await Promise.all([
			closePlay(session, now, shared),
			db
				.update(playbackSession)
				.set({
					status: reason === 'error' ? 'error' : 'stopped',
					stopReason: reason,
					stoppedAt: new Date(now)
				})
				.where(eq(playbackSession.id, sessionId))
				.catch(() => {})
		]);
	}

	/**
	 * Boot-time cleanup: a row still 'active' belongs to a dead process —
	 * unless this process still holds it. The dev server re-runs the `init`
	 * hook when files under src/ change while this module (and its live
	 * sessions) survives, so live sessions and their history rows are spared.
	 */
	async reapOrphans(): Promise<void> {
		const live = this.list();
		const liveIds = live.map((s) => s.id);
		await db
			.update(playbackSession)
			.set({ status: 'stopped', stopReason: 'idle', stoppedAt: new Date() })
			.where(
				and(
					eq(playbackSession.status, 'active'),
					liveIds.length ? notInArray(playbackSession.id, liveIds) : undefined
				)
			)
			.catch(() => {});
		const liveHistory = live.map((s) => s.historyId).filter((id): id is string => id !== null);
		await closeOrphanPlays(liveHistory).catch((err) =>
			log.warn({ err }, 'could not close orphan plays')
		);
	}

	#ensureReaper(): void {
		if (this.#reaper) return;
		this.#reaper = setInterval(() => {
			const cutoff = Date.now() - IDLE_TIMEOUT_MS;
			for (const session of this.#sessions.values()) {
				if (session.lastAccessAt < cutoff) void this.stop(session.id, 'idle');
			}
			if (this.#sessions.size === 0 && this.#reaper) {
				clearInterval(this.#reaper);
				this.#reaper = null;
			}
		}, REAPER_INTERVAL_MS);
		this.#reaper.unref?.();
	}
}

export const sessionManager = new SessionManager();
