import { asset } from '$app/paths';

// Public-domain / CC sample videos on CORS-enabled hosts (verified reachable).
// (Google's old gtv-videos-bucket now returns 403 and must not be used.)
const SAMPLE_VIDEOS = [
	'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
	'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
	'https://archive.org/download/Sintel/sintel-2048-surround_512kb.mp4',
	'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4',
	'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
	'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4'
];

/** Deterministically map a title/episode id to one of the public demo videos. */
export function getVideoSrc(id: string): string {
	let hash = 0;
	for (const char of id) hash += char.charCodeAt(0);
	return SAMPLE_VIDEOS[hash % SAMPLE_VIDEOS.length];
}

export interface SubtitleTrack {
	src: string;
	srclang: string;
	label: string;
	kind: 'captions' | 'subtitles';
}

/** Shared demo subtitle tracks; the same files are reused by every title. */
export const SUBTITLE_TRACKS: SubtitleTrack[] = [
	{ src: asset('/subtitles/en.vtt'), srclang: 'en', label: 'English', kind: 'captions' },
	{ src: asset('/subtitles/es.vtt'), srclang: 'es', label: 'Español', kind: 'subtitles' },
	{ src: asset('/subtitles/de.vtt'), srclang: 'de', label: 'Deutsch', kind: 'subtitles' },
	{ src: asset('/subtitles/fr.vtt'), srclang: 'fr', label: 'Français', kind: 'subtitles' }
];
