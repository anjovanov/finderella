import type { SearchResult } from '$lib/data';

/**
 * Browser-side call behind the navbar search dropdown. Pass an AbortSignal so
 * a newer keystroke can cancel the in-flight request; throws an Error carrying
 * the server's readable message on failure (e.g. "Sign in to continue.").
 */
export async function searchCatalog(
	query: string,
	limit: number,
	signal?: AbortSignal
): Promise<SearchResult[]> {
	const params = new URLSearchParams({ q: query, limit: String(limit) });
	const res = await fetch(`/api/search?${params}`, { signal });
	if (!res.ok) {
		let message = res.statusText;
		try {
			message = ((await res.json()) as { message?: string }).message ?? message;
		} catch {
			// non-JSON error body
		}
		throw new Error(message);
	}
	return ((await res.json()) as { results: SearchResult[] }).results;
}
