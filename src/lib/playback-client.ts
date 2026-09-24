/**
 * Browser-side playback session lifecycle. Watch pages call startPlayback on
 * mount / title change and stopPlayback on teardown; a pagehide beacon covers
 * tab closes. (Session creation deliberately lives outside load functions —
 * loads must be side-effect free.)
 */

import type { AudioTrack, SubtitleTrack } from './data/types';
import type { PlayerState } from './data/stats';
import type { QualityId } from './playback-quality';
import { DEFAULT_PLAYBACK_SETTINGS, type AudioChannels } from './data/playback-settings';
import { maxAudioChannels } from './audio-output';

export interface PlaybackDescriptor {
	mode: 'direct' | 'hls';
	src: string;
	sessionId: string;
	quality: QualityId;
	/** Probed frame size of the file being played (null when scanned without ffprobe). */
	source: { width: number | null; height: number | null };
	/** Subtitle tracks of the file, served as WebVTT under this session. */
	subtitles: SubtitleTrack[];
	/** Seek-bar thumbnail track (WebVTT + sprite sheets) under this session; null when the device can't make them. */
	trickplay: { vttSrc: string } | null;
	/** Audio streams of the file (empty when its device can't switch them). */
	audioTracks: AudioTrack[];
	/** The stream this session plays; null when the file has none listed. */
	audioTrackId: string | null;
}

export interface PlaybackTarget {
	kind: 'movie' | 'series';
	slug: string;
	episodeSlug?: string;
	/** Resume offset — pre-warms transcoding at the right position. */
	startSeconds?: number;
	/** Ladder rung; 'original' (default) = direct play when possible, else source-res transcode. */
	quality?: QualityId;
	/** An explicit audio-menu pick (media_audio id). */
	audioTrackId?: string | null;
	/** Preferred audio language: 'default' or an ISO 639-1 code. */
	audioLanguage?: string;
	/** The viewer's audio-channels setting; sent as the resolved `maxAudioChannels`. */
	audioChannels?: AudioChannels;
}

export async function startPlayback(
	target: PlaybackTarget,
	signal?: AbortSignal
): Promise<PlaybackDescriptor> {
	const { audioChannels = DEFAULT_PLAYBACK_SETTINGS.audioChannels, ...body } = target;
	const res = await fetch('/api/playback/start', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...body, maxAudioChannels: await maxAudioChannels(audioChannels) }),
		signal
	});
	if (!res.ok) {
		let message = res.statusText;
		try {
			message = ((await res.json()) as { message?: string }).message ?? message;
		} catch {
			// non-JSON error body
		}
		throw new Error(message);
	}
	return (await res.json()) as PlaybackDescriptor;
}

export function stopPlayback(sessionId: string | null): void {
	if (!sessionId) return;
	void fetch('/api/playback/stop', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ sessionId }),
		keepalive: true
	}).catch(() => {});
}

export function beaconStop(sessionId: string | null): void {
	if (!sessionId) return;
	const payload = new Blob([JSON.stringify({ sessionId })], { type: 'application/json' });
	navigator.sendBeacon('/api/playback/stop', payload);
}

export interface ProgressPayload extends PlaybackTarget {
	positionSeconds: number;
	durationSeconds: number;
}

export function reportProgress(payload: ProgressPayload, useBeacon = false): void {
	const body = JSON.stringify(payload);
	if (useBeacon) {
		navigator.sendBeacon('/api/progress', new Blob([body], { type: 'application/json' }));
		return;
	}
	void fetch('/api/progress', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
		keepalive: true
	}).catch(() => {});
}

const PROGRESS_INTERVAL_MS = 10_000;

/**
 * Per-watch-page progress reporter: throttled updates while playing, a final
 * flush on teardown/pagehide. Create one per (title, episode) playback.
 */
export function createProgressReporter(target: PlaybackTarget) {
	let lastSentAt = 0;
	let latest: { positionSeconds: number; durationSeconds: number } | null = null;
	return {
		onProgress(positionSeconds: number, durationSeconds: number): void {
			latest = { positionSeconds, durationSeconds };
			const now = Date.now();
			if (now - lastSentAt >= PROGRESS_INTERVAL_MS) {
				lastSentAt = now;
				reportProgress({ ...target, ...latest });
			}
		},
		flush(useBeacon = false): void {
			if (!latest) return;
			reportProgress({ ...target, ...latest }, useBeacon);
			latest = null;
		}
	};
}

/** What the player reports to the hub's activity monitor. */
export interface PlaybackSnapshot {
	state: PlayerState;
	positionSeconds: number;
	durationSeconds: number | null;
	/** The subtitle track shown; null = off. */
	subtitleTrackId: string | null;
}

const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Per-session heartbeat for admin statistics: sent right away when the state
 * or subtitle track changes and every 10 s once playback began. It keeps a
 * paused session alive and listed. A 410 means an admin stopped the stream —
 * `onTerminated` gets the message to show.
 */
export function createHeartbeat(sessionId: string, onTerminated: (message: string) => void) {
	let snapshot: PlaybackSnapshot = {
		state: 'unknown',
		positionSeconds: 0,
		durationSeconds: null,
		subtitleTrackId: null
	};
	let disposed = false;

	function send(): void {
		if (disposed) return;
		void fetch(`/api/stream/${sessionId}/heartbeat`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(snapshot),
			keepalive: true
		})
			.then(async (res) => {
				if (res.status !== 410 || disposed) return;
				dispose();
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				onTerminated(body?.message ?? 'Playback was stopped.');
			})
			.catch(() => {});
	}

	const timer = setInterval(() => {
		if (snapshot.state !== 'unknown') send();
	}, HEARTBEAT_INTERVAL_MS);

	function dispose(): void {
		disposed = true;
		clearInterval(timer);
	}

	return {
		update(next: Partial<PlaybackSnapshot>): void {
			const changed =
				(next.state !== undefined && next.state !== snapshot.state) ||
				(next.subtitleTrackId !== undefined && next.subtitleTrackId !== snapshot.subtitleTrackId);
			snapshot = { ...snapshot, ...next };
			if (changed && snapshot.state !== 'unknown') send();
		},
		dispose
	};
}
