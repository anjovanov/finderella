/** "1h 2m 3s" / "15m 25s" / "25s" — elapsed units, for "Resume at …" (a clock-style
 *  "15:25" reads like a time of day to play at). */
export function formatDurationUnits(totalSeconds: number): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (sec > 0 || parts.length === 0) parts.push(`${sec}s`);
	return parts.join(' ');
}
