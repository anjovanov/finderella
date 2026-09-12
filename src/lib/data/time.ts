/** "1:02:03" / "12:03" — clock-style, for "Resume at …". */
export function formatClock(totalSeconds: number): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** "1h 2m" / "12m" / "<1m" — rounded, for "… left". */
export function formatDurationShort(totalSeconds: number): string {
	const minutes = Math.round(Math.max(0, totalSeconds) / 60);
	if (minutes < 1) return '<1m';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
