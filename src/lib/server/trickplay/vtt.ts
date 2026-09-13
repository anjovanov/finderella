import type { TrickplayGeometry } from '@finderella/protocol';

/**
 * Hub-synthesized WebVTT thumbnail track (the same trick as the HLS playlist):
 * the sprite layout is fixed before the first sheet exists, so the whole track
 * can be handed to the player at once. Each cue names a tile as a media
 * fragment — `N.jpg#xywh=x,y,w,h` — resolved relative to the track URL.
 */

function pad(n: number, width: number): string {
	return String(n).padStart(width, '0');
}

/** `HH:MM:SS.mmm`; hours grow past two digits rather than wrapping. */
export function formatVttTime(ms: number): string {
	const whole = Math.max(0, Math.round(ms));
	const hours = Math.floor(whole / 3_600_000);
	const minutes = Math.floor((whole % 3_600_000) / 60_000);
	const seconds = Math.floor((whole % 60_000) / 1000);
	const millis = whole % 1000;
	return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

export function buildTrickplayVtt(geometry: TrickplayGeometry, durationMs: number): string {
	const perSheet = geometry.columns * geometry.rows;
	// While generating, `sheets` is a prediction; once ready it is the real file
	// count and wins over `tiles` (ffmpeg may end a frame or two early).
	const cues = Math.min(geometry.tiles, geometry.sheets * perSheet);
	const intervalMs = geometry.interval * 1000;
	const lines = ['WEBVTT', ''];
	for (let i = 0; i < cues; i++) {
		const start = i * intervalMs;
		if (start >= durationMs) break;
		const end = Math.min(start + intervalMs, durationMs);
		const sheet = Math.floor(i / perSheet);
		const slot = i % perSheet;
		const x = (slot % geometry.columns) * geometry.tileWidth;
		const y = Math.floor(slot / geometry.columns) * geometry.tileHeight;
		lines.push(
			`${formatVttTime(start)} --> ${formatVttTime(end)}`,
			`${sheet}.jpg#xywh=${x},${y},${geometry.tileWidth},${geometry.tileHeight}`,
			''
		);
	}
	return lines.join('\n');
}
