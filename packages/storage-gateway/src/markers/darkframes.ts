/**
 * Parser for ffmpeg's `metadata=mode=print` output of the `blackframe`
 * filter: `frame:N pts:P pts_time:T` followed by `lavfi.blackframe.pblack=NN`.
 * Timestamps are relative to the input seek point, so `startMs` is added
 * back to land on the source timeline.
 */
export interface DarkframeSeries {
	timesMs: number[];
	pblack: number[];
}

const PTS_RE = /pts_time:(-?[\d.]+)/;
const PBLACK_RE = /^lavfi\.blackframe\.pblack=(\d+(?:\.\d+)?)\s*$/;

export function parseBlackframeOutput(stdout: string, startMs: number): DarkframeSeries {
	const timesMs: number[] = [];
	const pblack: number[] = [];
	let pendingTime: number | null = null;
	for (const raw of stdout.split('\n')) {
		const line = raw.trim();
		if (line.startsWith('frame:')) {
			const t = Number(PTS_RE.exec(line)?.[1]);
			pendingTime = Number.isFinite(t) ? Math.max(0, Math.round(startMs + t * 1000)) : null;
			continue;
		}
		const match = PBLACK_RE.exec(line);
		if (match && pendingTime !== null) {
			timesMs.push(pendingTime);
			pblack.push(Math.min(100, Math.max(0, Math.round(Number(match[1])))));
			pendingTime = null;
		}
	}
	return { timesMs, pblack };
}
