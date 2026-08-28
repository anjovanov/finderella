/**
 * Browser-side playback session lifecycle. Watch pages call startPlayback on
 * mount / title change and stopPlayback on teardown; a pagehide beacon covers
 * tab closes. (Session creation deliberately lives outside load functions —
 * loads must be side-effect free.)
 */

import type { QualityId } from './playback-quality';

export interface PlaybackDescriptor {
	mode: 'direct' | 'hls';
	src: string;
	sessionId: string;
	quality: QualityId;
	/** Probed frame size of the file being played (null when scanned without ffprobe). */
	source: { width: number | null; height: number | null };
}

export interface PlaybackTarget {
	kind: 'movie' | 'series';
	slug: string;
	episodeSlug?: string;
	/** Resume offset — pre-warms transcoding at the right position. */
	startSeconds?: number;
	/** Ladder rung; 'original' (default) = direct play when possible, else source-res transcode. */
	quality?: QualityId;
}

export async function startPlayback(
	target: PlaybackTarget,
	signal?: AbortSignal
): Promise<PlaybackDescriptor> {
	const res = await fetch('/api/playback/start', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(target),
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
