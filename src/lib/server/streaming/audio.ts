import { languageName } from '@finderella/protocol';
import { channelLabel } from '$lib/data/media-format';
import type { AudioTrack } from '$lib/data/types';
import type { mediaAudio } from '$lib/server/db/schema';

export type AudioRow = typeof mediaAudio.$inferSelect;

/**
 * Player-facing label: language (or the stream title / `Track N`), an
 * informative title, commentary / audio-description markers and the channel
 * layout — "English (5.1)", "English – Commentary (Stereo)".
 */
export function audioLabel(row: AudioRow, index: number): string {
	const name = languageName(row.language);
	const title = row.title?.trim();
	let label = name ?? (title || `Track ${index + 1}`);
	// Titles like "English 5.1" or "Stereo" repeat what the label already says.
	const redundant =
		!title ||
		!name ||
		title.toLowerCase().includes(name.toLowerCase()) ||
		/^(mono|stereo|surround|[257]\.[01])/i.test(title);
	if (!redundant) label += ` – ${title}`;
	if (row.commentary && !/commentary/i.test(label)) label += ' – Commentary';
	if (row.descriptive) label += ' – Audio description';
	const channels = channelLabel(row.channels);
	return channels ? `${label} (${channels})` : label;
}

/** The file's audio streams in container order, as the player lists them. */
export function toAudioTracks(rows: AudioRow[]): AudioTrack[] {
	const seen = new Map<string, number>();
	return [...rows]
		.sort((a, b) => a.streamIndex - b.streamIndex)
		.map((row, index) => {
			let label = audioLabel(row, index);
			const count = (seen.get(label) ?? 0) + 1;
			seen.set(label, count);
			if (count > 1) label = `${label} ${count}`;
			return {
				id: row.id,
				label,
				language: row.language ?? 'und',
				default: row.isDefault
			};
		});
}

/**
 * Which stream to play: an explicit pick (when it belongs to this file), else
 * the preferred language's main track (not commentary / audio description,
 * default-flagged first), else the container's default, else the first one.
 */
export function pickAudioTrack(
	rows: AudioRow[],
	want: { trackId?: string | null; language?: string | null }
): AudioRow | null {
	const ordered = [...rows].sort((a, b) => a.streamIndex - b.streamIndex);
	if (ordered.length === 0) return null;
	const explicit = want.trackId ? ordered.find((row) => row.id === want.trackId) : undefined;
	if (explicit) return explicit;
	if (want.language && want.language !== 'default') {
		const main = ordered.filter(
			(row) => row.language === want.language && !row.commentary && !row.descriptive
		);
		const match = main.find((row) => row.isDefault) ?? main[0];
		if (match) return match;
	}
	return ordered.find((row) => row.isDefault) ?? ordered[0];
}

/**
 * The stream a browser plays when it gets the file itself (direct play): the
 * first one — Chrome/Firefox can't switch audio tracks of a progressive file,
 * and the direct-play matrix only vets the first stream's codec.
 */
export function directPlayAudio(rows: AudioRow[]): AudioRow | null {
	return rows.reduce<AudioRow | null>(
		(first, row) => (!first || row.streamIndex < first.streamIndex ? row : first),
		null
	);
}

/**
 * Channels + bitrate for a transcode's audio: the viewer's cap (1, 2 or 6)
 * applied to the source stream. Surround is kept only when the source has it
 * (7.1 comes out 5.1); unknown sources stay stereo. `stereoKbps` is the
 * quality rung's stereo budget — surround gets twice that, mono half (≥64k).
 */
export function transcodeAudio(
	maxChannels: 1 | 2 | 6,
	sourceChannels: number | null | undefined,
	stereoKbps: number
): { channels: 1 | 2 | 6; kbps: number } {
	if (maxChannels === 1) return { channels: 1, kbps: Math.max(64, Math.round(stereoKbps / 2)) };
	if (maxChannels === 6 && (sourceChannels ?? 0) >= 6) return { channels: 6, kbps: stereoKbps * 2 };
	return { channels: 2, kbps: stereoKbps };
}
