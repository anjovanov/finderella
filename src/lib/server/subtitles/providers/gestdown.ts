import { z } from 'zod';
import { log } from '$lib/server/log';
import { toGestdown } from '../languages';
import { RateLimiter, sleep } from '../limiter';
import { listZipSubtitles, looksLikeZip, pickZipSubtitle } from '../zip';
import {
	ProviderError,
	type DownloadedSubtitle,
	type SubtitleCandidate,
	type TitleQuery
} from './types';

/**
 * Gestdown — the keyless Addic7ed (and SuperSubtitles) proxy. TV only. Shows
 * are resolved by name (there is no TMDB lookup); the show id is cached a
 * day. A 423 means "show is being refreshed" *or* "language not understood"
 * (same empty body), so languages are normalized first and never retried in a loop.
 */

const API = 'https://api.gestdown.info';
const REQUEST_TIMEOUT_MS = 15_000;
const SHOW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = 'Finderella v0.1';

const limiter = new RateLimiter(1250); // ~48/min, under the 50/min sustained limit

const ShowSearchResponse = z.object({
	shows: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				tmdbId: z.number().nullish(),
				tvDbId: z.number().nullish(),
				seasons: z.array(z.number()).default([])
			})
		)
		.nullish()
});

const SubtitleSearchResponse = z.object({
	matchingSubtitles: z
		.array(
			z.object({
				subtitleId: z.string(),
				version: z.string().nullish(),
				completed: z.boolean().nullish(),
				hearingImpaired: z.boolean().nullish(),
				corrected: z.boolean().nullish(),
				hd: z.boolean().nullish(),
				downloadUri: z.string().nullish(),
				language: z.string().nullish(),
				downloadCount: z.number().nullish(),
				source: z.string().nullish(),
				qualities: z.array(z.string()).nullish(),
				release: z.string().nullish()
			})
		)
		.nullish()
});

const showCache = new Map<string, { id: string; at: number }>();

async function get(path: string, init: { accept?: string } = {}): Promise<Response> {
	for (let attempt = 0; attempt < 2; attempt++) {
		await limiter.wait();
		let res: Response;
		try {
			res = await fetch(`${API}${path}`, {
				headers: { 'user-agent': USER_AGENT, accept: init.accept ?? 'application/json' },
				redirect: 'follow',
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		} catch (err) {
			throw new ProviderError(
				'gestdown',
				'network',
				`Gestdown request failed: ${(err as Error).message}`
			);
		}
		if (res.status === 429 && attempt === 0) {
			await sleep((Number(res.headers.get('retry-after')) || 5) * 1000);
			continue;
		}
		if (res.status === 429) {
			throw new ProviderError(
				'gestdown',
				'rate-limit',
				'Gestdown is throttling requests; try again in a minute'
			);
		}
		return res;
	}
	throw new ProviderError('gestdown', 'network', 'Gestdown did not answer');
}

/** Gestdown's own id for a show, matched on TMDB id when we have one, else by name. */
export async function resolveGestdownShow(query: TitleQuery): Promise<string | null> {
	const key = query.tmdbId ? `tmdb:${query.tmdbId}` : `name:${query.title.toLowerCase()}`;
	const cached = showCache.get(key);
	if (cached && cached.at + SHOW_CACHE_TTL_MS > Date.now()) return cached.id;
	const name = query.title.trim();
	if (name.length < 3) return null;
	const res = await get(`/shows/search/${encodeURIComponent(name)}`);
	if (res.status === 404) return null;
	if (!res.ok)
		throw new ProviderError(
			'gestdown',
			'network',
			`Gestdown show search failed (HTTP ${res.status})`
		);
	const parsed = ShowSearchResponse.safeParse(await res.json().catch(() => null));
	const shows = parsed.success ? (parsed.data.shows ?? []) : [];
	if (shows.length === 0) return null;
	const byTmdb = query.tmdbId ? shows.find((s) => s.tmdbId === query.tmdbId) : undefined;
	const byName = shows.find((s) => s.name.toLowerCase() === name.toLowerCase());
	const show = byTmdb ?? byName ?? shows[0];
	showCache.set(key, { id: show.id, at: Date.now() });
	return show.id;
}

function isWholeSeasonPack(id: string): boolean {
	return id.startsWith('sp_') && !id.includes('_entry_') && !id.includes('_ep_');
}

export async function searchGestdown(
	query: TitleQuery,
	language: string
): Promise<SubtitleCandidate[]> {
	if (query.kind !== 'episode' || query.season === undefined || query.episode === undefined)
		return [];
	const showId = await resolveGestdownShow(query);
	if (!showId) return [];
	const out: SubtitleCandidate[] = [];
	const seen = new Set<string>();
	for (const lang of toGestdown(language)) {
		const res = await get(
			`/subtitles/get/${showId}/${query.season}/${query.episode}/${encodeURIComponent(lang)}`
		);
		if (res.status === 423) {
			throw new ProviderError(
				'gestdown',
				'rate-limit',
				'Gestdown is still fetching this show from Addic7ed; try again in a minute'
			);
		}
		if (res.status === 404) continue;
		if (!res.ok)
			throw new ProviderError('gestdown', 'network', `Gestdown search failed (HTTP ${res.status})`);
		const parsed = SubtitleSearchResponse.safeParse(await res.json().catch(() => null));
		if (!parsed.success) {
			log.warn({ issues: z.prettifyError(parsed.error) }, 'gestdown response failed validation');
			continue;
		}
		for (const item of parsed.data.matchingSubtitles ?? []) {
			if (item.completed === false || seen.has(item.subtitleId)) continue;
			seen.add(item.subtitleId);
			const notes = [item.source ?? 'Addic7ed'];
			if (isWholeSeasonPack(item.subtitleId)) notes.push('season pack');
			out.push({
				provider: 'gestdown',
				id: item.subtitleId,
				language,
				releaseName: (item.release?.trim() || item.version?.trim() || 'Untitled').replace(
					/,\s*/g,
					' · '
				),
				hearingImpaired: Boolean(item.hearingImpaired),
				forced: false,
				downloads: item.downloadCount ?? 0,
				rating: (item.corrected ? 5 : 0) + (item.hd ? 3 : 0),
				trusted: false,
				aiTranslated: false,
				machineTranslated: false,
				hashMatch: false,
				url: 'https://www.gestdown.info',
				note: notes.join(' · ')
			});
		}
	}
	return out;
}

export async function downloadGestdown(
	id: string,
	wanted: { season?: number; episode?: number }
): Promise<DownloadedSubtitle> {
	if (!/^[a-z0-9_-]+$/i.test(id))
		throw new ProviderError('gestdown', 'network', 'invalid Gestdown subtitle id');
	const res = await get(`/subtitles/download/${id}`, { accept: '*/*' });
	if (res.status === 404) {
		throw new ProviderError(
			'gestdown',
			'network',
			'Gestdown no longer has this subtitle (it was removed upstream)'
		);
	}
	if (!res.ok)
		throw new ProviderError('gestdown', 'network', `Gestdown download failed (HTTP ${res.status})`);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (looksLikeZip(bytes)) {
		const entry = pickZipSubtitle(listZipSubtitles(bytes), wanted);
		if (!entry)
			throw new ProviderError(
				'gestdown',
				'network',
				'The season pack holds no subtitle for this episode'
			);
		return { bytes: entry.bytes, format: entry.format };
	}
	return { bytes, format: 'srt' };
}

/** Admin "Test": reachability + version. */
export async function testGestdown(): Promise<string> {
	const res = await get('/application/info');
	if (!res.ok) throw new ProviderError('gestdown', 'network', `HTTP ${res.status}`);
	const info = z
		.object({ applicationVersion: z.string().nullish() })
		.safeParse(await res.json().catch(() => null));
	return `Reachable${info.success && info.data.applicationVersion ? ` (Gestdown v${info.data.applicationVersion})` : ''}; no account needed`;
}
