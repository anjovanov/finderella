import { ProviderError, type SubtitleProviderId } from './providers/types';

/**
 * Downloads from providers are the one place untrusted bytes enter the hub.
 * Every hop must be HTTPS to a host the provider is known to use, and the
 * body is read with a hard cap so a runaway response can't exhaust memory.
 */

export const MAX_SUBTITLE_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

/** Hosts each provider may send us to for a subtitle file (suffix match for subdomains). */
export const PROVIDER_HOSTS: Record<SubtitleProviderId, string[]> = {
	opensubtitles: ['opensubtitles.com'],
	subdl: ['dl.subdl.com', 'api.subdl.com', 'subdl.com'],
	gestdown: ['api.gestdown.info'],
	titlovi: ['titlovi.com', 'kodi.titlovi.com']
};

export function hostAllowed(url: URL, hosts: string[]): boolean {
	if (url.protocol !== 'https:') return false;
	const host = url.hostname.toLowerCase();
	return hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Assert a provider URL before any request (search/login/download alike). */
export function providerUrl(provider: SubtitleProviderId, url: string | URL): URL {
	const parsed = typeof url === 'string' ? new URL(url) : url;
	if (!hostAllowed(parsed, PROVIDER_HOSTS[provider])) {
		throw new ProviderError(
			provider,
			'network',
			`${provider} link points somewhere unexpected (${parsed.hostname})`
		);
	}
	return parsed;
}

export interface SafeFetchOptions {
	provider: SubtitleProviderId;
	headers?: Record<string, string>;
	timeoutMs?: number;
	maxBytes?: number;
	/** Injected for tests. */
	fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
	status: number;
	headers: Headers;
	bytes: Uint8Array;
	finalUrl: URL;
}

/**
 * GET a provider file: manual redirects (each hop re-checked against the
 * allowlist), `content-length` and streamed size both capped.
 */
export async function fetchSubtitleBytes(
	url: string | URL,
	opts: SafeFetchOptions
): Promise<SafeFetchResult> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const maxBytes = opts.maxBytes ?? MAX_SUBTITLE_DOWNLOAD_BYTES;
	let current = providerUrl(opts.provider, url);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let res: Response;
		try {
			res = await fetchImpl(current, {
				headers: opts.headers,
				redirect: 'manual',
				signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000)
			});
		} catch (err) {
			throw new ProviderError(
				opts.provider,
				'network',
				`${opts.provider} download failed: ${(err as Error).message}`
			);
		}
		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			await res.body?.cancel().catch(() => {});
			if (!location || hop === MAX_REDIRECTS) {
				throw new ProviderError(
					opts.provider,
					'network',
					`${opts.provider} download redirected too many times`
				);
			}
			current = providerUrl(opts.provider, new URL(location, current));
			continue;
		}
		const declared = Number(res.headers.get('content-length'));
		if (Number.isFinite(declared) && declared > maxBytes) {
			await res.body?.cancel().catch(() => {});
			throw new ProviderError(opts.provider, 'network', 'subtitle file is too large');
		}
		const bytes = await readCapped(res, maxBytes, opts.provider);
		return { status: res.status, headers: res.headers, bytes, finalUrl: current };
	}
	throw new ProviderError(
		opts.provider,
		'network',
		`${opts.provider} download redirected too many times`
	);
}

async function readCapped(
	res: Response,
	maxBytes: number,
	provider: SubtitleProviderId
): Promise<Uint8Array> {
	if (!res.body) return new Uint8Array(0);
	const reader = res.body.getReader();
	const parts: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			throw new ProviderError(provider, 'network', 'subtitle file is too large');
		}
		parts.push(value);
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.byteLength;
	}
	return out;
}
