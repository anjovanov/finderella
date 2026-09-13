import { error, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { TEXT_SUBTITLE_CODECS } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { mediaSubtitle } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { sessionManager } from '$lib/server/streaming/session-manager';

/** A gateway too old to answer `subtitle.get` never replies; fail fast instead of hanging the <track> load. */
const FIRST_BYTE_TIMEOUT_MS = 20_000;
/** Reverse proxies (nginx 60 s, Cloudflare 100 s) drop bodies that stay silent this long. */
const KEEPALIVE_IDLE_MS = 15_000;
const NEWLINE = new Uint8Array([0x0a]);
const TEXT_CODECS = new Set<string>(TEXT_SUBTITLE_CODECS);

/**
 * Emit a blank line whenever the body has been idle — legal between WebVTT
 * blocks, and enough to keep a proxy from cutting a sparse forced track that
 * ffmpeg is still demuxing out of a large container. Only fires after the
 * upstream has ended a line, so a cue is never split.
 */
function withKeepalive(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
	let lastByte = 0;
	let timer: NodeJS.Timeout | null = null;
	let controller: TransformStreamDefaultController<Uint8Array> | null = null;
	const clear = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};
	const arm = () => {
		clear();
		timer = setTimeout(() => {
			if (lastByte === 0x0a) {
				try {
					controller?.enqueue(NEWLINE);
				} catch {
					return; // stream already closed or errored
				}
			}
			arm();
		}, KEEPALIVE_IDLE_MS);
	};
	signal.addEventListener('abort', clear, { once: true });
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			start(c) {
				controller = c;
				arm();
			},
			transform(chunk, c) {
				if (chunk.byteLength > 0) lastByte = chunk[chunk.byteLength - 1];
				c.enqueue(chunk);
				arm();
			},
			flush: clear
		})
	);
}

/**
 * One subtitle track as WebVTT, converted/extracted by the gateway that owns
 * the file. Authorization = the playback session uuid, like /file: the row
 * must belong to the file that session is playing.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const session = sessionManager.get(params.sessionId!);
	if (!session) error(404, 'no such playback session');
	sessionManager.touch(session.id);
	const { file, gatewayId, rootPath } = session.source;

	const row = await db.query.mediaSubtitle.findFirst({
		where: eq(mediaSubtitle.id, params.subtitleId!)
	});
	if (!row || row.mediaFileId !== file.id) error(404, 'no such subtitle');
	if (row.source === 'embedded' && !TEXT_CODECS.has(row.format)) {
		error(415, 'bitmap subtitles cannot be shown');
	}

	const gateway = registry.get(gatewayId);
	if (!gateway) error(502, 'device is offline');
	if (!gateway.capabilities.subtitles) {
		error(501, 'the device holding this title runs a gateway too old to serve subtitles');
	}
	const needsFfmpeg = row.source === 'embedded' || (row.format !== 'srt' && row.format !== 'vtt');
	if (needsFfmpeg && !gateway.capabilities.ffmpeg) {
		error(501, 'this subtitle needs ffmpeg on the device holding the file');
	}

	let body: ReadableStream<Uint8Array>;
	try {
		body = registry.openByteStream(
			gatewayId,
			{
				type: 'subtitle.get',
				rootPath,
				relPath: file.relPath,
				source: row.source,
				streamIndex: row.streamIndex ?? undefined,
				subtitlePath: row.relPath ?? undefined
			},
			request.signal,
			{ firstByteTimeoutMs: FIRST_BYTE_TIMEOUT_MS }
		);
	} catch {
		error(502, 'device is offline');
	}
	return new Response(withKeepalive(body, request.signal), {
		headers: { 'content-type': 'text/vtt; charset=utf-8', 'cache-control': 'no-store' }
	});
};
