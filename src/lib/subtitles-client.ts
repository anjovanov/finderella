/** Browser calls behind the player's "Find subtitles" panel. */

import type { SubtitleTrack } from './data/types';

export type SubtitleProviderId = 'opensubtitles' | 'subdl' | 'gestdown' | 'titlovi';

export interface SubtitleSearchResult {
	provider: SubtitleProviderId;
	id: string;
	language: string;
	releaseName: string;
	fileName?: string;
	hearingImpaired: boolean;
	forced: boolean;
	downloads: number;
	rating: number;
	trusted: boolean;
	aiTranslated: boolean;
	machineTranslated: boolean;
	hashMatch: boolean;
	uploader?: string;
	fps?: number;
	url?: string;
	script?: 'cyrillic';
	note?: string;
}

export interface SubtitleSearchResponse {
	candidates: SubtitleSearchResult[];
	errors: { provider: SubtitleProviderId; kind: string; message: string; resetAt: string | null }[];
	query: { title: string; year?: number; season?: number; episode?: number };
}

export interface SubtitleTarget {
	kind: 'movie' | 'series';
	slug: string;
	episodeSlug?: string;
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
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
	return (await res.json()) as T;
}

export function searchSubtitlesOnline(
	target: SubtitleTarget,
	language: string,
	signal?: AbortSignal
): Promise<SubtitleSearchResponse> {
	return postJson('/api/subtitles/search', { ...target, language }, signal);
}

export function downloadSubtitleOnline(
	sessionId: string,
	result: SubtitleSearchResult
): Promise<{ trackId: string; tracks: SubtitleTrack[] }> {
	return postJson('/api/subtitles/download', {
		sessionId,
		provider: result.provider,
		id: result.id,
		language: result.language,
		hearingImpaired: result.hearingImpaired,
		forced: result.forced,
		releaseName: result.releaseName,
		script: result.script
	});
}
