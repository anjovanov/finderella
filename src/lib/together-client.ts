/**
 * Browser-side calls for watch parties. Each throws an Error carrying the
 * server's readable message (and the HTTP `status`) on failure.
 */

export class TogetherRequestError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
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
		throw new TogetherRequestError(message, res.status);
	}
	return (await res.json()) as T;
}

export interface StartPartyRequest {
	kind: 'movie' | 'series';
	slug: string;
	episodeSlug?: string;
	positionSeconds?: number;
	playing?: boolean;
}

/**
 * Create a party at `positionSeconds` (default: where the creator's profile left
 * off), paused unless `playing`; answers its code.
 */
export async function startParty(request: StartPartyRequest): Promise<string> {
	const { code } = await postJson<{ code: string }>('/api/together', request);
	return code;
}

/** A single-use ticket for the party's WebSocket; `resumeId` keeps this tab's seat. */
export async function requestTicket(code: string, resumeId: string | null): Promise<string> {
	const { ticket } = await postJson<{ ticket: string }>(
		`/api/together/${encodeURIComponent(code)}/ticket`,
		{ resumeParticipantId: resumeId }
	);
	return ticket;
}
