import { z } from 'zod';
import { log } from '$lib/server/log';
import { fromSubdl, toSubdl } from '../languages';
import { RateLimiter, sleep } from '../limiter';
import { listZipSubtitles, looksLikeZip, pickZipSubtitle } from '../zip';
import {
	ProviderError,
	type DownloadedSubtitle,
	type SubtitleCandidate,
	type TitleQuery
} from './types';

/**
 * Subdl API v1 client. Search results point at ZIP archives on dl.subdl.com
 * (raw files for `unpack_files`); the archive's best subtitle entry is
 * picked hub-side.
 */

const API_URL = 'https://api.subdl.com/api/v1/subtitles';
const DOWNLOAD_BASE = 'https://dl.subdl.com';
const REQUEST_TIMEOUT_MS = 15_000;

const limiter = new RateLimiter(300);

const SearchResponse = z.object({
	status: z.boolean().optional(),
	error: z.string().nullish(),
	subtitles: z
		.array(
			z.object({
				release_name: z.string().nullish(),
				name: z.string().nullish(),
				url: z.string().nullish(),
				language: z.string().nullish(),
				author: z.string().nullish(),
				hi: z.boolean().nullish(),
				full_season: z.boolean().nullish(),
				season: z.number().nullish(),
				episode: z.number().nullish(),
				fps: z.union([z.string(), z.number()]).nullish(),
				subtitlePage: z.string().nullish(),
				unpack_files: z
					.array(
						z.object({
							name: z.string().nullish(),
							release_name: z.string().nullish(),
							season: z.number().nullish(),
							episode: z.number().nullish(),
							language: z.string().nullish(),
							hi: z.boolean().nullish(),
							url: z.string().nullish()
						})
					)
					.nullish()
			})
		)
		.default([])
});

function subdlError(status: number, body: unknown): ProviderError {
	const error = z
		.object({ error: z.string().nullish(), message: z.string().nullish() })
		.safeParse(body);
	const code = error.success ? error.data.error : null;
	if (status === 403) return new ProviderError('subdl', 'auth', 'Subdl rejected the API key');
	if (status === 429 || code === 'daily_limit' || code === 'api_download_limit_exceeded') {
		if (code === 'rate_limit' || code === 'service_busy') {
			return new ProviderError(
				'subdl',
				'rate-limit',
				'Subdl is throttling requests; try again shortly'
			);
		}
		return new ProviderError('subdl', 'quota', 'Subdl daily limit reached');
	}
	return new ProviderError(
		'subdl',
		'network',
		`Subdl request failed (HTTP ${status}${code ? `, ${code}` : ''})`
	);
}

export async function searchSubdl(
	apiKey: string,
	query: TitleQuery,
	language: string
): Promise<SubtitleCandidate[]> {
	const url = new URL(API_URL);
	url.searchParams.set('api_key', apiKey.trim());
	url.searchParams.set('languages', toSubdl(language).join(','));
	url.searchParams.set('subs_per_page', '30');
	url.searchParams.set('hi', '1');
	url.searchParams.set('releases', '1');
	url.searchParams.set('unpack', '1');
	if (query.kind === 'movie') {
		url.searchParams.set('type', 'movie');
		if (query.tmdbId) url.searchParams.set('tmdb_id', String(query.tmdbId));
		else {
			url.searchParams.set('film_name', query.title);
			if (query.year) url.searchParams.set('year', String(query.year));
		}
	} else {
		url.searchParams.set('type', 'tv');
		if (query.tmdbId) url.searchParams.set('tmdb_id', String(query.tmdbId));
		else url.searchParams.set('film_name', query.title);
		if (query.season !== undefined) url.searchParams.set('season_number', String(query.season));
		if (query.episode !== undefined) url.searchParams.set('episode_number', String(query.episode));
	}
	let res: Response;
	let body: unknown;
	for (let attempt = 0; ; attempt++) {
		await limiter.wait();
		try {
			res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		} catch (err) {
			throw new ProviderError(
				'subdl',
				'network',
				`Subdl request failed: ${(err as Error).message}`
			);
		}
		body = await res.json().catch(() => null);
		if ((res.status === 429 || res.status >= 500) && attempt === 0) {
			await sleep((Number(res.headers.get('retry-after')) || 5) * 1000);
			continue;
		}
		break;
	}
	if (!res.ok) throw subdlError(res.status, body);
	const parsed = SearchResponse.safeParse(body);
	if (!parsed.success) {
		log.warn({ issues: z.prettifyError(parsed.error) }, 'subdl response failed validation');
		return [];
	}
	if (parsed.data.status === false) {
		if (parsed.data.error)
			log.info({ error: parsed.data.error }, 'subdl search returned no results');
		return [];
	}
	const out: SubtitleCandidate[] = [];
	for (const item of parsed.data.subtitles) {
		const code = fromSubdl(item.language);
		if (code !== language) continue;
		const wantsEpisode =
			query.kind === 'episode' && query.season !== undefined && query.episode !== undefined;
		// Season packs: prefer the unpacked per-episode file when the API lists it.
		const unpacked = wantsEpisode
			? item.unpack_files?.find(
					(f) => f.season === query.season && f.episode === query.episode && f.url
				)
			: undefined;
		if (wantsEpisode && item.full_season && !unpacked) {
			// Whole-season archive without an unpacked match: still usable, the
			// archive picker matches the episode tag inside.
		} else if (
			wantsEpisode &&
			!item.full_season &&
			item.episode != null &&
			item.episode !== query.episode
		) {
			continue;
		}
		const href = unpacked?.url ?? item.url;
		if (!href) continue;
		out.push({
			provider: 'subdl',
			id: href,
			language,
			releaseName: (unpacked?.release_name || item.release_name || item.name || 'Untitled').trim(),
			fileName: unpacked?.name ?? item.name ?? undefined,
			hearingImpaired: Boolean(unpacked?.hi ?? item.hi),
			forced: false,
			downloads: 0,
			rating: 0,
			trusted: false,
			aiTranslated: false,
			machineTranslated: false,
			hashMatch: false,
			uploader: item.author ?? undefined,
			fps: item.fps != null && Number.isFinite(Number(item.fps)) ? Number(item.fps) : undefined,
			url: item.subtitlePage ? `https://subdl.com${item.subtitlePage}` : undefined
		});
	}
	return out;
}

export async function downloadSubdl(
	apiKey: string,
	href: string,
	wanted: { season?: number; episode?: number }
): Promise<DownloadedSubtitle> {
	const url = new URL(href, DOWNLOAD_BASE);
	url.searchParams.set('api_key', apiKey.trim());
	await limiter.wait();
	let res: Response;
	try {
		res = await fetch(url, {
			redirect: 'follow',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2)
		});
	} catch (err) {
		throw new ProviderError('subdl', 'network', `Subdl download failed: ${(err as Error).message}`);
	}
	if (!res.ok) throw subdlError(res.status, await res.json().catch(() => null));
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (looksLikeZip(bytes)) {
		const entry = pickZipSubtitle(listZipSubtitles(bytes), wanted);
		if (!entry)
			throw new ProviderError('subdl', 'network', 'The Subdl archive holds no text subtitle');
		return { bytes: entry.bytes, format: entry.format };
	}
	const ext = /\.(srt|vtt|ass|ssa)$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? 'srt';
	return { bytes, format: ext };
}

/** Admin "Test" button: a search that only needs a valid key. */
export async function testSubdl(apiKey: string): Promise<string> {
	const url = new URL('https://api.subdl.com/api/v1/me');
	url.searchParams.set('api_key', apiKey.trim());
	await limiter.wait();
	let res: Response;
	try {
		res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
	} catch (err) {
		throw new ProviderError('subdl', 'network', `Subdl request failed: ${(err as Error).message}`);
	}
	const body = await res.json().catch(() => null);
	if (!res.ok) throw subdlError(res.status, body);
	return 'API key accepted';
}
