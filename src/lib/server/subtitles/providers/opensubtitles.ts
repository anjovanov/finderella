import { z } from 'zod';
import { log } from '$lib/server/log';
import { fromOpenSubtitles } from '../languages';
import { RateLimiter, sleep } from '../limiter';
import { fetchSubtitleBytes } from '../safe-fetch';
import { buildOpenSubtitlesSearchParams } from './opensubtitles-params';
import {
	ProviderError,
	type DownloadedSubtitle,
	type SubtitleCandidate,
	type TitleQuery
} from './types';

/**
 * OpenSubtitles.com REST API v1 client. One application key (the admin's
 * consumer) plus an optional user login for the larger per-user download
 * quota. The API redirects non-canonical search URLs, so params are built by
 * buildOpenSubtitlesSearchParams and redirects are followed.
 */

const DEFAULT_HOST = 'api.opensubtitles.com';
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
export const OPENSUBTITLES_USER_AGENT = 'Finderella v0.1';

export interface OpenSubtitlesCredentials {
	apiKey: string;
	username?: string | null;
	password?: string | null;
}

const limiter = new RateLimiter(250);

/** Lenient: unknown keys stripped, most fields optional — never crash on a shape drift. */
const SearchResponse = z.object({
	total_count: z.number().optional(),
	data: z
		.array(
			z.object({
				id: z.union([z.string(), z.number()]).optional(),
				attributes: z.object({
					language: z.string().nullish(),
					download_count: z.number().nullish(),
					hearing_impaired: z.boolean().nullish(),
					foreign_parts_only: z.boolean().nullish(),
					from_trusted: z.boolean().nullish(),
					ai_translated: z.boolean().nullish(),
					machine_translated: z.boolean().nullish(),
					ratings: z.number().nullish(),
					fps: z.number().nullish(),
					release: z.string().nullish(),
					url: z.string().nullish(),
					moviehash_match: z.boolean().nullish(),
					uploader: z.object({ name: z.string().nullish() }).nullish(),
					files: z
						.array(z.object({ file_id: z.number(), file_name: z.string().nullish() }))
						.default([])
				})
			})
		)
		.default([])
});

const LoginResponse = z.object({
	token: z.string(),
	base_url: z.string().optional()
});

const DownloadResponse = z.object({
	link: z.string(),
	file_name: z.string().nullish(),
	remaining: z.number().nullish(),
	reset_time_utc: z.string().nullish()
});

const QuotaBody = z.object({
	message: z.string().nullish(),
	remaining: z.number().nullish(),
	reset_time_utc: z.string().nullish()
});

interface Session {
	apiKey: string;
	token: string | null;
	host: string;
	expiresAt: number;
}

let session: Session | null = null;
/** Last quota info seen from a download (or a 406), shown on the admin page. */
let quota: { remaining: number | null; resetAt: Date | null; seenAt: Date } | null = null;

export function openSubtitlesQuota() {
	return quota;
}

/** Drop the cached login (settings changed). */
export function resetOpenSubtitlesSession(): void {
	session = null;
}

function headers(apiKey: string, token?: string | null): Record<string, string> {
	const out: Record<string, string> = {
		accept: '*/*',
		'api-key': apiKey,
		'user-agent': OPENSUBTITLES_USER_AGENT,
		'content-type': 'application/json'
	};
	if (token) out.authorization = `Bearer ${token}`;
	return out;
}

function quotaFrom(body: unknown): { remaining: number | null; resetAt: Date | null } {
	const parsed = QuotaBody.safeParse(body);
	const remaining = parsed.success ? (parsed.data.remaining ?? null) : null;
	const reset =
		parsed.success && parsed.data.reset_time_utc ? new Date(parsed.data.reset_time_utc) : null;
	return { remaining, resetAt: reset && !Number.isNaN(reset.getTime()) ? reset : null };
}

async function ensureSession(creds: OpenSubtitlesCredentials): Promise<Session> {
	const apiKey = creds.apiKey.trim();
	if (session && session.apiKey === apiKey && session.expiresAt > Date.now()) return session;
	const username = creds.username?.trim();
	const password = creds.password ?? '';
	if (!username || !password) {
		session = { apiKey, token: null, host: DEFAULT_HOST, expiresAt: Infinity };
		return session;
	}
	await limiter.wait();
	let res: Response;
	try {
		res = await fetch(`https://${DEFAULT_HOST}/api/v1/login`, {
			method: 'POST',
			headers: headers(apiKey),
			body: JSON.stringify({ username, password }),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch (err) {
		throw new ProviderError(
			'opensubtitles',
			'network',
			`OpenSubtitles login failed: ${(err as Error).message}`
		);
	}
	if (res.status === 401) {
		throw new ProviderError(
			'opensubtitles',
			'auth',
			'OpenSubtitles rejected the username/password'
		);
	}
	if (res.status === 403) {
		throw new ProviderError('opensubtitles', 'auth', 'OpenSubtitles rejected the API key');
	}
	const parsed = LoginResponse.safeParse(await res.json().catch(() => null));
	if (!res.ok || !parsed.success) {
		throw new ProviderError(
			'opensubtitles',
			'network',
			`OpenSubtitles login failed (HTTP ${res.status})`
		);
	}
	session = {
		apiKey,
		token: parsed.data.token,
		host: parsed.data.base_url?.replace(/^https?:\/\//, '') || DEFAULT_HOST,
		expiresAt: Date.now() + TOKEN_TTL_MS
	};
	return session;
}

/** One request with the house retry policy: 429/5xx retried once after the advertised delay. */
async function request(
	creds: OpenSubtitlesCredentials,
	path: string,
	init: { method?: string; body?: string; params?: URLSearchParams }
): Promise<{ res: Response; body: unknown }> {
	const current = await ensureSession(creds);
	const url = new URL(`https://${current.host}/api/v1${path}`);
	if (init.params) url.search = init.params.toString();
	for (let attempt = 0; attempt < 2; attempt++) {
		await limiter.wait();
		let res: Response;
		try {
			res = await fetch(url, {
				method: init.method ?? 'GET',
				headers: headers(current.apiKey, current.token),
				body: init.body,
				redirect: 'follow',
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
			});
		} catch (err) {
			throw new ProviderError(
				'opensubtitles',
				'network',
				`OpenSubtitles request failed: ${(err as Error).message}`
			);
		}
		if ((res.status === 429 || res.status >= 500) && attempt === 0) {
			const retryAfter =
				Number(res.headers.get('retry-after')) || Number(res.headers.get('ratelimit-reset')) || 1;
			await sleep(retryAfter * 1000);
			continue;
		}
		const body: unknown = await res.json().catch(() => null);
		if (res.status === 401) {
			// Expired/invalid token: forget it so the next call logs in again.
			session = null;
			throw new ProviderError('opensubtitles', 'auth', 'OpenSubtitles session expired; retry');
		}
		if (res.status === 403) {
			throw new ProviderError(
				'opensubtitles',
				'auth',
				'OpenSubtitles rejected the API key or User-Agent'
			);
		}
		if (res.status === 429) {
			throw new ProviderError(
				'opensubtitles',
				'rate-limit',
				'OpenSubtitles is throttling requests; try again in a minute'
			);
		}
		return { res, body };
	}
	throw new ProviderError('opensubtitles', 'network', 'OpenSubtitles did not answer');
}

export async function searchOpenSubtitles(
	creds: OpenSubtitlesCredentials,
	query: TitleQuery,
	language: string,
	opts: { excludeAi?: boolean } = {}
): Promise<SubtitleCandidate[]> {
	const params = buildOpenSubtitlesSearchParams(query, language, opts);
	const { res, body } = await request(creds, '/subtitles', { params });
	if (!res.ok) {
		log.warn({ status: res.status, params: params.toString() }, 'opensubtitles search rejected');
		throw new ProviderError(
			'opensubtitles',
			'network',
			`OpenSubtitles search failed (HTTP ${res.status})`
		);
	}
	const parsed = SearchResponse.safeParse(body);
	if (!parsed.success) {
		log.warn({ issues: z.prettifyError(parsed.error) }, 'opensubtitles response failed validation');
		return [];
	}
	const out: SubtitleCandidate[] = [];
	for (const item of parsed.data.data) {
		const a = item.attributes;
		const file = a.files[0];
		if (!file) continue;
		const code = fromOpenSubtitles(a.language);
		if (code !== language) continue;
		out.push({
			provider: 'opensubtitles',
			id: String(file.file_id),
			language,
			releaseName: a.release?.trim() || file.file_name || 'Untitled',
			fileName: file.file_name ?? undefined,
			hearingImpaired: Boolean(a.hearing_impaired),
			forced: Boolean(a.foreign_parts_only),
			downloads: a.download_count ?? 0,
			rating: a.ratings ?? 0,
			trusted: Boolean(a.from_trusted),
			aiTranslated: Boolean(a.ai_translated),
			machineTranslated: Boolean(a.machine_translated),
			hashMatch: Boolean(a.moviehash_match),
			uploader: a.uploader?.name ?? undefined,
			fps: a.fps ?? undefined,
			url: a.url ?? undefined
		});
	}
	return out;
}

export async function downloadOpenSubtitles(
	creds: OpenSubtitlesCredentials,
	fileId: string
): Promise<DownloadedSubtitle> {
	const { res, body } = await request(creds, '/download', {
		method: 'POST',
		body: JSON.stringify({ file_id: Number(fileId), sub_format: 'srt' })
	});
	if (res.status === 406) {
		const q = quotaFrom(body);
		quota = { ...q, seenAt: new Date() };
		const message = QuotaBody.safeParse(body).data?.message;
		if (q.remaining !== null && q.remaining < 0) {
			throw new ProviderError(
				'opensubtitles',
				'quota',
				message ?? 'OpenSubtitles download quota used up for today',
				q.resetAt ?? undefined
			);
		}
		throw new ProviderError(
			'opensubtitles',
			'network',
			message ?? 'OpenSubtitles refused the download'
		);
	}
	const parsed = DownloadResponse.safeParse(body);
	if (!res.ok || !parsed.success) {
		throw new ProviderError(
			'opensubtitles',
			'network',
			`OpenSubtitles download failed (HTTP ${res.status})`
		);
	}
	quota = { ...quotaFrom(body), seenAt: new Date() };
	const current = await ensureSession(creds);
	const file = await fetchSubtitleBytes(parsed.data.link, {
		provider: 'opensubtitles',
		headers: headers(current.apiKey, current.token),
		timeoutMs: REQUEST_TIMEOUT_MS
	});
	if (file.status !== 200) {
		throw new ProviderError(
			'opensubtitles',
			'network',
			`OpenSubtitles file fetch failed (HTTP ${file.status})`
		);
	}
	return { bytes: file.bytes, format: 'srt' };
}

/** Admin "Test" button: validates the key (and the login when credentials are set). */
export async function testOpenSubtitles(creds: OpenSubtitlesCredentials): Promise<string> {
	resetOpenSubtitlesSession();
	const current = await ensureSession(creds);
	if (current.token) {
		const { res, body } = await request(creds, '/infos/user', {});
		if (!res.ok) throw new ProviderError('opensubtitles', 'network', `HTTP ${res.status}`);
		const info = z
			.object({
				data: z.object({
					level: z.string().nullish(),
					allowed_downloads: z.number().nullish(),
					remaining_downloads: z.number().nullish()
				})
			})
			.safeParse(body);
		if (info.success) {
			const d = info.data.data;
			quota = { remaining: d.remaining_downloads ?? null, resetAt: null, seenAt: new Date() };
			return `Signed in (${d.level ?? 'member'}): ${d.remaining_downloads ?? '?'} of ${d.allowed_downloads ?? '?'} downloads left today`;
		}
		return 'Signed in';
	}
	// /infos/* answer without a key; a (cached, unmetered) search is the cheapest call that checks it.
	const params = new URLSearchParams({ languages: 'en', query: 'matrix' });
	const { res } = await request(creds, '/subtitles', { params });
	if (!res.ok) throw new ProviderError('opensubtitles', 'network', `HTTP ${res.status}`);
	return 'API key accepted (no account: 5 downloads per day per IP)';
}
