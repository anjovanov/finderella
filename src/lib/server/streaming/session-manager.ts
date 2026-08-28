import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { playbackSession } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import type { PlayableSource } from './source-picker';
import type { QualityId } from '$lib/playback-quality';

export interface HotSession {
	id: string;
	userId: string;
	source: PlayableSource;
	mode: 'direct' | 'hls';
	quality: QualityId;
	createdAt: number;
	lastAccessAt: number;
	lastPersistedAt: number;
}

const IDLE_TIMEOUT_MS = 60_000;
const REAPER_INTERVAL_MS = 30_000;
const PERSIST_ACCESS_EVERY_MS = 30_000;

/**
 * Hot playback-session state (single-process hub). The DB row mirrors it for
 * observability and boot-time orphan cleanup; the session uuid doubles as the
 * capability token in /api/stream URLs, so lookups here also authorize them.
 */
class SessionManager {
	#sessions = new Map<string, HotSession>();
	#reaper: NodeJS.Timeout | null = null;

	async start(
		userId: string,
		source: PlayableSource,
		mode: 'direct' | 'hls',
		quality: QualityId = 'original'
	): Promise<HotSession> {
		const [row] = await db
			.insert(playbackSession)
			.values({
				userId,
				mediaFileId: source.file.id,
				gatewayId: source.gatewayId,
				mode,
				quality
			})
			.returning({ id: playbackSession.id });
		const now = Date.now();
		const session: HotSession = {
			id: row.id,
			userId,
			source,
			mode,
			quality,
			createdAt: now,
			lastAccessAt: now,
			lastPersistedAt: now
		};
		this.#sessions.set(session.id, session);
		this.#ensureReaper();
		log.info(
			{ sessionId: session.id, mode, quality, relPath: source.file.relPath },
			'playback started'
		);
		return session;
	}

	get(sessionId: string): HotSession | undefined {
		return this.#sessions.get(sessionId);
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

	async stop(sessionId: string, reason: 'client' | 'idle' | 'error'): Promise<void> {
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
		await db
			.update(playbackSession)
			.set({ status: reason === 'error' ? 'error' : 'stopped', stoppedAt: new Date() })
			.where(eq(playbackSession.id, sessionId))
			.catch(() => {});
	}

	/** Boot-time cleanup: any row still 'active' belongs to a dead process. */
	async reapOrphans(): Promise<void> {
		await db
			.update(playbackSession)
			.set({ status: 'stopped', stoppedAt: new Date() })
			.where(eq(playbackSession.status, 'active'))
			.catch(() => {});
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
