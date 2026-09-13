import { describe, expect, it } from 'vitest';
import { fetchSubtitleBytes, hostAllowed, providerUrl } from './safe-fetch';

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
	return (async (input: string | URL | Request) => {
		const key = String(input instanceof Request ? input.url : input);
		const handler = routes[key];
		if (!handler) throw new Error(`unexpected fetch ${key}`);
		return handler();
	}) as typeof fetch;
}

describe('provider host allowlist', () => {
	it('accepts only https on known hosts and subdomains', () => {
		expect(hostAllowed(new URL('https://www.opensubtitles.com/x'), ['opensubtitles.com'])).toBe(
			true
		);
		expect(hostAllowed(new URL('http://www.opensubtitles.com/x'), ['opensubtitles.com'])).toBe(
			false
		);
		expect(hostAllowed(new URL('https://evil-opensubtitles.com/x'), ['opensubtitles.com'])).toBe(
			false
		);
		expect(() => providerUrl('subdl', 'https://169.254.169.254/latest')).toThrow(/unexpected/);
	});
});

describe('fetchSubtitleBytes', () => {
	it('follows allowed redirects and refuses off-list or http hops', async () => {
		const ok = await fetchSubtitleBytes('https://api.gestdown.info/a', {
			provider: 'gestdown',
			fetchImpl: fakeFetch({
				'https://api.gestdown.info/a': () =>
					new Response(null, { status: 302, headers: { location: '/b' } }),
				'https://api.gestdown.info/b': () => new Response('WEBVTT\n')
			})
		});
		expect(new TextDecoder().decode(ok.bytes)).toBe('WEBVTT\n');
		expect(ok.finalUrl.pathname).toBe('/b');

		await expect(
			fetchSubtitleBytes('https://dl.subdl.com/x.zip', {
				provider: 'subdl',
				fetchImpl: fakeFetch({
					'https://dl.subdl.com/x.zip': () =>
						new Response(null, { status: 302, headers: { location: 'http://dl.subdl.com/x.zip' } })
				})
			})
		).rejects.toThrow(/unexpected/);
	});

	it('caps the body by content-length and by streamed size', async () => {
		await expect(
			fetchSubtitleBytes('https://titlovi.com/download/?mediaid=1', {
				provider: 'titlovi',
				maxBytes: 10,
				fetchImpl: fakeFetch({
					'https://titlovi.com/download/?mediaid=1': () =>
						new Response('x'.repeat(5), { headers: { 'content-length': '5000' } })
				})
			})
		).rejects.toThrow(/too large/);
		await expect(
			fetchSubtitleBytes('https://titlovi.com/download/?mediaid=2', {
				provider: 'titlovi',
				maxBytes: 10,
				fetchImpl: fakeFetch({
					'https://titlovi.com/download/?mediaid=2': () => new Response('x'.repeat(50))
				})
			})
		).rejects.toThrow(/too large/);
	});
});
