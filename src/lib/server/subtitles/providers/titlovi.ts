import { z } from 'zod';
import { log } from '$lib/server/log';
import { RateLimiter } from '../limiter';
import { listZipSubtitles, looksLikeZip, pickZipSubtitle } from '../zip';
import { fromTitloviLang, titloviSupports, toTitloviLang } from './titlovi-languages';
import {
	ProviderError,
	type DownloadedSubtitle,
	type SubtitleCandidate,
	type TitleQuery
} from './types';

/**
 * Titlovi.com (ex-Yugoslav languages + English). Needs a free account whose
 * API access Titlovi may revoke; the token is cached and refreshed a day
 * before it expires. Downloads need no auth but do need a browser-like
 * User-Agent (Cloudflare), answer missing ids with HTTP 200 "Wrong
 * parameters.", and come as ZIPs in windows-1250/1251.
 */

const API = 'https://kodi.titlovi.com/api/subtitles';
const DOWNLOAD = 'https://titlovi.com/download/';
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_PAGES = 3;
const BROWSER_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const limiter = new RateLimiter(600);

export interface TitloviCredentials {
	username: string;
	password: string;
}

const TokenResponse = z.object({
	Token: z.string(),
	UserId: z.number(),
	UserName: z.string().nullish(),
	ExpirationDate: z.string().nullish()
});

const SearchResponse = z.object({
	ResultsFound: z.number().nullish(),
	PagesAvailable: z.number().nullish(),
	CurrentPage: z.number().nullish(),
	SubtitleResults: z
		.array(
			z.object({
				Id: z.number(),
				Title: z.string().nullish(),
				Year: z.number().nullish(),
				Type: z.number().nullish(),
				Season: z.number().nullish(),
				Episode: z.number().nullish(),
				Lang: z.string().nullish(),
				DownloadCount: z.number().nullish(),
				Rating: z.number().nullish(),
				Release: z.string().nullish()
			})
		)
		.default([])
});

interface Session {
	username: string;
	token: string;
	userId: number;
	expiresAt: number;
}
let session: Session | null = null;
let cooldownUntil = 0;

export function resetTitloviSession(): void {
	session = null;
}

function checkCooldown() {
	if (cooldownUntil > Date.now()) {
		throw new ProviderError(
			'titlovi',
			'rate-limit',
			'Titlovi asked us to slow down; paused for a few minutes'
		);
	}
}

/** `ExpirationDate` carries no zone — it's the server's local time; treat it as ours. */
function parseExpiry(value: string | null | undefined): number {
	if (!value) return Date.now() + 6 * 24 * 60 * 60 * 1000;
	const t = new Date(value).getTime();
	return Number.isFinite(t) ? t : Date.now() + 6 * 24 * 60 * 60 * 1000;
}

async function login(creds: TitloviCredentials): Promise<Session> {
	checkCooldown();
	const url = new URL(`${API}/gettoken`);
	url.searchParams.set('username', creds.username.trim());
	url.searchParams.set('password', creds.password);
	url.searchParams.set('json', 'true');
	await limiter.wait();
	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'content-length': '0', 'user-agent': BROWSER_UA, 'x-app': 'Finderella' },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch (err) {
		throw new ProviderError(
			'titlovi',
			'network',
			`Titlovi login failed: ${(err as Error).message}`
		);
	}
	if (res.status === 401 || res.status === 403) {
		throw new ProviderError(
			'titlovi',
			'auth',
			'Titlovi rejected the credentials, or API access is disabled for this account'
		);
	}
	if (res.status === 429) {
		cooldownUntil = Date.now() + COOLDOWN_MS;
		throw new ProviderError(
			'titlovi',
			'rate-limit',
			'Titlovi is throttling requests; paused for a few minutes'
		);
	}
	const parsed = TokenResponse.safeParse(await res.json().catch(() => null));
	if (!res.ok || !parsed.success) {
		throw new ProviderError('titlovi', 'network', `Titlovi login failed (HTTP ${res.status})`);
	}
	session = {
		username: creds.username,
		token: parsed.data.Token,
		userId: parsed.data.UserId,
		expiresAt: parseExpiry(parsed.data.ExpirationDate)
	};
	return session;
}

async function ensureSession(creds: TitloviCredentials): Promise<Session> {
	if (
		session &&
		session.username === creds.username &&
		session.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()
	) {
		return session;
	}
	return login(creds);
}

async function searchPage(
	creds: TitloviCredentials,
	build: (params: URLSearchParams) => void,
	page: number,
	retried = false
): Promise<z.infer<typeof SearchResponse>> {
	checkCooldown();
	const current = await ensureSession(creds);
	const url = new URL(`${API}/search`);
	url.searchParams.set('token', current.token);
	url.searchParams.set('userid', String(current.userId));
	url.searchParams.set('json', 'true');
	url.searchParams.set('pg', String(page));
	build(url.searchParams);
	await limiter.wait();
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { 'user-agent': BROWSER_UA, 'x-app': 'Finderella' },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch (err) {
		throw new ProviderError(
			'titlovi',
			'network',
			`Titlovi search failed: ${(err as Error).message}`
		);
	}
	if ((res.status === 401 || res.status === 403) && !retried) {
		session = null;
		return searchPage(creds, build, page, true);
	}
	if (res.status === 401 || res.status === 403) {
		throw new ProviderError(
			'titlovi',
			'auth',
			'Titlovi rejected the session; check the account and its API access'
		);
	}
	if (res.status === 429) {
		cooldownUntil = Date.now() + COOLDOWN_MS;
		throw new ProviderError(
			'titlovi',
			'rate-limit',
			'Titlovi is throttling requests; paused for a few minutes'
		);
	}
	if (!res.ok)
		throw new ProviderError('titlovi', 'network', `Titlovi search failed (HTTP ${res.status})`);
	const parsed = SearchResponse.safeParse(await res.json().catch(() => null));
	if (!parsed.success) {
		log.warn({ issues: z.prettifyError(parsed.error) }, 'titlovi response failed validation');
		return { SubtitleResults: [] };
	}
	return parsed.data;
}

export async function searchTitlovi(
	creds: TitloviCredentials,
	query: TitleQuery,
	language: string
): Promise<SubtitleCandidate[]> {
	if (!titloviSupports(language)) return [];
	const isEpisode = query.kind === 'episode';
	const build = (params: URLSearchParams) => {
		params.set('query', query.title);
		params.set('type', isEpisode ? '2' : '1');
		params.set('lang', toTitloviLang(language));
		if (isEpisode && query.season !== undefined) {
			// `0` alongside the real number also returns season packs.
			params.append('season', String(query.season));
			params.append('season', '0');
			if (query.episode !== undefined) {
				params.append('episode', String(query.episode));
				params.append('episode', '0');
			}
		}
	};
	const out: SubtitleCandidate[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const data = await searchPage(creds, build, page);
		for (const row of data.SubtitleResults) {
			const lang = fromTitloviLang(row.Lang);
			if (!lang || lang.code !== language) continue;
			if (row.Type != null && row.Type !== (isEpisode ? 2 : 1)) continue;
			if (!isEpisode && query.year && row.Year && Math.abs(row.Year - query.year) > 1) continue;
			let pack = false;
			if (isEpisode) {
				if (row.Season != null && query.season !== undefined && row.Season !== query.season)
					continue;
				pack = row.Episode === 0;
				if (
					!pack &&
					query.episode !== undefined &&
					row.Episode != null &&
					row.Episode !== query.episode
				)
					continue;
			}
			const notes: string[] = [];
			if (lang.script === 'cyrillic') notes.push('Cyrillic');
			if (pack) notes.push('season pack');
			out.push({
				provider: 'titlovi',
				id: `${row.Id}:${row.Type ?? (isEpisode ? 2 : 1)}`,
				language,
				releaseName: row.Release?.trim() || row.Title?.trim() || 'Untitled',
				hearingImpaired: false,
				forced: false,
				downloads: row.DownloadCount ?? 0,
				rating: row.Rating ?? 0,
				trusted: false,
				aiTranslated: false,
				machineTranslated: false,
				hashMatch: false,
				url: 'https://titlovi.com',
				script: lang.script,
				note: notes.length > 0 ? notes.join(' · ') : undefined
			});
		}
		const pages = data.PagesAvailable ?? 1;
		if (page >= pages || data.SubtitleResults.length < 30) break;
	}
	return out;
}

const RAR_MAGIC = [0x52, 0x61, 0x72, 0x21];

export async function downloadTitlovi(
	id: string,
	wanted: { season?: number; episode?: number },
	script?: 'cyrillic'
): Promise<DownloadedSubtitle> {
	const [mediaId, type = '1'] = id.split(':');
	if (!/^\d+$/.test(mediaId))
		throw new ProviderError('titlovi', 'network', 'invalid Titlovi subtitle id');
	checkCooldown();
	const url = new URL(DOWNLOAD);
	url.searchParams.set('type', type);
	url.searchParams.set('mediaid', mediaId);
	await limiter.wait();
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { 'user-agent': BROWSER_UA, referer: 'https://titlovi.com/', 'x-app': 'Finderella' },
			redirect: 'follow',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2)
		});
	} catch (err) {
		throw new ProviderError(
			'titlovi',
			'network',
			`Titlovi download failed: ${(err as Error).message}`
		);
	}
	if (res.status === 429) {
		cooldownUntil = Date.now() + COOLDOWN_MS;
		throw new ProviderError(
			'titlovi',
			'rate-limit',
			'Titlovi is throttling requests; paused for a few minutes'
		);
	}
	if (!res.ok)
		throw new ProviderError('titlovi', 'network', `Titlovi download failed (HTTP ${res.status})`);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (looksLikeZip(bytes)) {
		const entry = pickZipSubtitle(listZipSubtitles(bytes), wanted, { script: script ?? 'latin' });
		if (!entry)
			throw new ProviderError('titlovi', 'network', 'The Titlovi archive holds no text subtitle');
		return { bytes: entry.bytes, format: entry.format };
	}
	if (RAR_MAGIC.every((b, i) => bytes[i] === b)) {
		throw new ProviderError(
			'titlovi',
			'network',
			'Titlovi returned a RAR archive, which is not supported yet'
		);
	}
	const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
	if (head.includes('-->')) return { bytes, format: 'srt' };
	throw new ProviderError(
		'titlovi',
		'network',
		'Titlovi returned no file for this subtitle (it may have been removed)'
	);
}

/** Admin "Test": a fresh login. */
export async function testTitlovi(creds: TitloviCredentials): Promise<string> {
	resetTitloviSession();
	const s = await login(creds);
	return `Signed in as ${creds.username.trim()}; token valid until ${new Date(s.expiresAt).toLocaleString()}`;
}
