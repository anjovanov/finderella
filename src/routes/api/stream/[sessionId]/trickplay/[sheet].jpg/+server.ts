import { error, type RequestHandler } from '@sveltejs/kit';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import { sessionManager } from '$lib/server/streaming/session-manager';

/** Covers the gateway's own wait for a sheet still being written (20 s) plus tunnel slack. */
const FIRST_BYTE_TIMEOUT_MS = 25_000;
/** A 10×10 sheet of 320 px tiles is a few hundred KB; anything near this is wrong. */
const MAX_SHEET_BYTES = 8 * 1024 * 1024;
const SHEET_RE = /^\d{1,4}$/;

async function collect(body: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
	const parts: Uint8Array[] = [];
	let total = 0;
	const reader = body.getReader();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_SHEET_BYTES) {
			await reader.cancel().catch(() => {});
			throw new Error('sheet too large');
		}
		parts.push(value);
	}
	const out = new Uint8Array(new ArrayBuffer(total));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

/**
 * One sprite sheet, fetched from the device that owns the file. The bytes are
 * buffered before answering so the status code and cache headers are always
 * right: a success is immutable for this session-bound URL (the player re-sets
 * the image source every time the pointer crosses a sheet boundary, so the
 * browser cache matters), while "not ready yet" must never be cached.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	if (!SHEET_RE.test(params.sheet!)) error(404, 'no such sheet');
	const sheet = Number(params.sheet);
	const session = sessionManager.get(params.sessionId!);
	if (!session) error(404, 'no such playback session');
	sessionManager.touch(session.id);
	const { file, gatewayId, rootPath } = session.source;
	if (!session.trickplay || sheet >= session.trickplay.sheets) error(404, 'no such sheet');

	const gateway = registry.get(gatewayId);
	if (!gateway) error(502, 'device is offline');
	if (!gateway.capabilities.trickplay) {
		error(501, 'the device holding this title runs a gateway too old to make thumbnails');
	}

	let body: ReadableStream<Uint8Array>;
	try {
		body = registry.openByteStream(
			gatewayId,
			{ type: 'trickplay.get', rootPath, relPath: file.relPath, sheet },
			request.signal,
			{ firstByteTimeoutMs: FIRST_BYTE_TIMEOUT_MS }
		);
	} catch {
		error(502, 'device is offline');
	}
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = await collect(body);
	} catch (err) {
		// Not written yet, not generated, or the wait timed out — all "try later".
		log.debug({ sessionId: session.id, sheet, err }, 'trickplay sheet unavailable');
		return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
	}
	return new Response(bytes, {
		headers: {
			'content-type': 'image/jpeg',
			'content-length': String(bytes.byteLength),
			'cache-control': 'private, max-age=86400, immutable'
		}
	});
};
