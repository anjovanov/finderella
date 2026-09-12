/**
 * Browser-side calls behind the card ⋮ menu and the detail-page buttons.
 * Each throws an Error carrying the server's readable message on failure.
 */

export type LibraryKind = 'movie' | 'series';

async function postJson(path: string, body: unknown): Promise<void> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
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
}

export function setWatchlist(kind: LibraryKind, slug: string, inWatchlist: boolean): Promise<void> {
	return postJson('/api/watchlist', { kind, slug, inWatchlist });
}

/** Hide a title from "Continue watching" until it is played again. */
export function dismissContinueWatching(kind: LibraryKind, slug: string): Promise<void> {
	return postJson('/api/progress/dismiss', { kind, slug });
}

/** Mark a movie / every episode of a series as fully watched. */
export function markAsWatched(kind: LibraryKind, slug: string): Promise<void> {
	return postJson('/api/progress/watched', { kind, slug });
}
