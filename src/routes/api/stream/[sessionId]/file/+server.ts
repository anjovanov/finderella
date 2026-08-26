import { error, type RequestHandler } from '@sveltejs/kit';
import { registry } from '$lib/server/gateways/registry';
import { contentTypeFor } from '$lib/server/streaming/compat';
import { sessionManager } from '$lib/server/streaming/session-manager';

/**
 * Range-proxied direct playback. Authorization is the unguessable session
 * uuid (bound to a user, revocable, idle-expiring) — the auth hook
 * short-circuits /api/stream/* so segment/range fetches skip the Better Auth
 * session lookup.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const session = sessionManager.get(params.sessionId!);
	if (!session || session.mode !== 'direct') error(404, 'no such playback session');
	sessionManager.touch(session.id);

	const { file, rootPath, gatewayId } = session.source;
	const size = file.size;

	// Parse a single-range header; video elements request "bytes=start-" ranges.
	let start = 0;
	let end = size - 1;
	let status = 200;
	const range = request.headers.get('range');
	if (range) {
		const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
		if (!match || (match[1] === '' && match[2] === '')) {
			error(416, 'unsupported range');
		}
		if (match[1] === '') {
			// suffix range: last N bytes
			const suffix = Math.min(Number(match[2]), size);
			start = size - suffix;
		} else {
			start = Number(match[1]);
			if (match[2] !== '') end = Math.min(Number(match[2]), size - 1);
		}
		if (start > end || start >= size) {
			return new Response(null, {
				status: 416,
				headers: { 'content-range': `bytes */${size}` }
			});
		}
		status = 206;
	}

	const length = end - start + 1;
	let body: ReadableStream<Uint8Array>;
	try {
		body = registry.openByteStream(
			gatewayId,
			{ type: 'file.read', rootPath, relPath: file.relPath, offset: start, length },
			request.signal
		);
	} catch {
		error(502, 'device is offline');
	}

	const headers: Record<string, string> = {
		'content-type': contentTypeFor(file),
		'content-length': String(length),
		'accept-ranges': 'bytes',
		'cache-control': 'no-store'
	};
	if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${size}`;
	return new Response(body, { status, headers });
};
