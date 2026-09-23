import { z } from 'zod';
import { LibraryKind, ProbedFile } from './media.js';

/**
 * Finderella gateway protocol, control plane.
 *
 * One WebSocket per gateway, dialed out from the gateway to the hub. Control
 * messages are JSON text frames validated by the discriminated unions below;
 * bulk data travels as binary frames (see framing.ts).
 *
 * Every message carries a per-connection `id`. Request/response correlation:
 * a `resp` message references the request it answers via `re`. To avoid id
 * collisions without coordination, hub-initiated requests use odd ids and
 * gateway-initiated ones even ids (see nextId in framing.ts).
 */

export const PROTOCOL_VERSION = 1;

const base = z.object({
	id: z.number().int().nonnegative()
});

export const GatewayCapabilities = z.object({
	ffmpeg: z.boolean(),
	ffmpegVersion: z.string().optional(),
	hwaccels: z.array(z.string()).default([]),
	/** Answers `subtitle.get` (older gateways never do — the hub must not wait on them). */
	subtitles: z.boolean().default(false),
	/** Answers `subtitle.put` (writes downloaded sidecars next to the video). */
	subtitleWrite: z.boolean().default(false),
	/** Answers `trickplay.ensure` / `trickplay.get` (seek-bar thumbnails; needs ffmpeg + ffprobe). */
	trickplay: z.boolean().default(false),
	/** Honours `session.start.audioStreamIndex` (older gateways always transcode the first audio stream). */
	audioSelect: z.boolean().default(false)
});
export type GatewayCapabilities = z.infer<typeof GatewayCapabilities>;

/* ---------- gateway → hub ---------- */

export const HelloMessage = base.extend({
	type: z.literal('hello'),
	protocolVersion: z.number().int(),
	gatewayVersion: z.string(),
	capabilities: GatewayCapabilities
});
export type HelloMessage = z.infer<typeof HelloMessage>;

export const PingMessage = base.extend({
	type: z.literal('ping')
});
export type PingMessage = z.infer<typeof PingMessage>;

/** Generic response to a hub-initiated request (`re` = request id). */
export const RespMessage = base.extend({
	type: z.literal('resp'),
	re: z.number().int(),
	ok: z.boolean(),
	error: z.string().optional(),
	data: z.unknown().optional()
});
export type RespMessage = z.infer<typeof RespMessage>;

/** A batch of scanned files (WS frames are ordered; `scan.done` finalizes). */
export const ScanFileMessage = base.extend({
	type: z.literal('scan.file'),
	libraryId: z.string(),
	files: z.array(ProbedFile).min(1).max(100)
});
export type ScanFileMessage = z.infer<typeof ScanFileMessage>;

export const ScanDoneMessage = base.extend({
	type: z.literal('scan.done'),
	libraryId: z.string(),
	stats: z.object({
		files: z.number().int().nonnegative(),
		errors: z.number().int().nonnegative()
	})
});
export type ScanDoneMessage = z.infer<typeof ScanDoneMessage>;

export const GatewayMessage = z.discriminatedUnion('type', [
	HelloMessage,
	PingMessage,
	RespMessage,
	ScanFileMessage,
	ScanDoneMessage
]);
export type GatewayMessage = z.infer<typeof GatewayMessage>;

/* ---------- hub → gateway ---------- */

export const HubLimits = z.object({
	maxConcurrentTransfers: z.number().int().positive(),
	maxTranscodeSessions: z.number().int().positive(),
	chunkBytes: z.number().int().positive(),
	creditWindowBytes: z.number().int().positive()
});
export type HubLimits = z.infer<typeof HubLimits>;

export const WelcomeMessage = base.extend({
	type: z.literal('welcome'),
	protocolVersion: z.number().int(),
	gatewayId: z.string(),
	limits: HubLimits
});
export type WelcomeMessage = z.infer<typeof WelcomeMessage>;

export const PongMessage = base.extend({
	type: z.literal('pong'),
	re: z.number().int()
});
export type PongMessage = z.infer<typeof PongMessage>;

export const ScanStartMessage = base.extend({
	type: z.literal('scan.start'),
	libraryId: z.string(),
	rootPath: z.string().min(1),
	kind: LibraryKind
});
export type ScanStartMessage = z.infer<typeof ScanStartMessage>;

/**
 * Read a byte range of a file. The gateway answers with binary frames tagged
 * with this message's id (FIN flag on the last), then `resp {ok:true}`; on
 * failure it sends `resp {ok:false}` instead. Flow control: the gateway starts
 * with `limits.creditWindowBytes` of credit and the hub replenishes with
 * `credit` messages as the browser drains.
 */
export const FileReadMessage = base.extend({
	type: z.literal('file.read'),
	rootPath: z.string().min(1),
	relPath: z.string().min(1),
	offset: z.number().int().nonnegative(),
	length: z.number().int().positive()
});
export type FileReadMessage = z.infer<typeof FileReadMessage>;

export const CreditMessage = base.extend({
	type: z.literal('credit'),
	re: z.number().int(),
	bytes: z.number().int().positive()
});
export type CreditMessage = z.infer<typeof CreditMessage>;

export const CancelMessage = base.extend({
	type: z.literal('cancel'),
	re: z.number().int()
});
export type CancelMessage = z.infer<typeof CancelMessage>;

/**
 * Start an HLS transcode session: ffmpeg re-encodes to 4s-aligned fmp4
 * segments in a per-session temp dir. The gateway answers with `resp` once
 * ffmpeg is spawned (ok) or with an error. Segments are then pulled with
 * `hls.get`; the gateway transparently restarts ffmpeg when a requested
 * segment is outside the produced window (seek).
 */
export const SessionStartMessage = base.extend({
	type: z.literal('session.start'),
	sessionId: z.string(),
	rootPath: z.string().min(1),
	relPath: z.string().min(1),
	startSeconds: z.number().nonnegative(),
	segmentSeconds: z.number().positive(),
	durationMs: z.number().int().positive(),
	/** Transcode plan from the hub's quality ladder (src/lib/playback-quality.ts). */
	quality: z.object({
		maxWidth: z.number().int().positive(),
		/** Absent = CRF only, no VBV ceiling. */
		maxVideoKbps: z.number().int().positive().optional(),
		audioKbps: z.number().int().positive(),
		level: z.enum(['4.1', '5.2'])
	}),
	/** Absolute ffprobe index of the audio stream to encode. Absent = the first audio stream. */
	audioStreamIndex: z.number().int().nonnegative().optional(),
	/** Output audio channels (the viewer's cap applied to the source). Absent = stereo. */
	audioChannels: z.union([z.literal(1), z.literal(2), z.literal(6)]).optional()
});
export type SessionStartMessage = z.infer<typeof SessionStartMessage>;

export const SessionStopMessage = base.extend({
	type: z.literal('session.stop'),
	sessionId: z.string()
});
export type SessionStopMessage = z.infer<typeof SessionStopMessage>;

/** Fetch one HLS asset (init.mp4 or seg-<n>.m4s) — answered with binary frames. */
export const HlsGetMessage = base.extend({
	type: z.literal('hls.get'),
	sessionId: z.string(),
	name: z.string().regex(/^(init\.mp4|seg-\d+\.m4s)$/)
});
export type HlsGetMessage = z.infer<typeof HlsGetMessage>;

/**
 * Fetch one subtitle track as WebVTT — answered like `file.read` (credit-gated
 * binary frames, FIN, then `resp`). `relPath` is the video; `streamIndex` is
 * ffprobe's absolute stream index for an embedded track, `subtitlePath` the
 * library-relative sidecar file. The gateway converts srt/ass/embedded text
 * tracks to UTF-8 WebVTT (ffmpeg for everything but srt/vtt).
 */
export const SubtitleGetMessage = base.extend({
	type: z.literal('subtitle.get'),
	rootPath: z.string().min(1),
	relPath: z.string().min(1),
	source: z.enum(['embedded', 'sidecar']),
	streamIndex: z.number().int().nonnegative().optional(),
	subtitlePath: z.string().min(1).optional()
});
export type SubtitleGetMessage = z.infer<typeof SubtitleGetMessage>;

/** Downloaded sidecars may be a few hundred KB; this is the decoded ceiling. */
export const MAX_SUBTITLE_PUT_BYTES = 2 * 1024 * 1024;

/**
 * Write a subtitle file next to a video. `relPath` is the library-relative
 * target (its folder must already exist — the gateway never creates
 * directories); an existing file is refused with error `exists` unless
 * `overwrite` is set. Answered with `resp` (`data: { size, mtimeMs }`).
 */
export const SubtitlePutMessage = base.extend({
	type: z.literal('subtitle.put'),
	rootPath: z.string().min(1),
	relPath: z.string().min(1),
	contentBase64: z.string().min(1),
	overwrite: z.boolean().default(false)
});
export type SubtitlePutMessage = z.infer<typeof SubtitlePutMessage>;

/* ---------- trickplay (seek-bar thumbnails) ---------- */

/**
 * Layout of a file's sprite sheets, computed by the gateway before ffmpeg runs
 * (tile height follows the display aspect ratio, so anamorphic sources come
 * out right). `sheets` is predicted from the probed duration while a job is
 * queued/generating and the actual file count once ready.
 */
export const TrickplayGeometry = z.object({
	version: z.number().int().positive(),
	/** Seconds between tiles. */
	interval: z.number().positive(),
	tileWidth: z.number().int().positive(),
	tileHeight: z.number().int().positive(),
	columns: z.number().int().positive(),
	rows: z.number().int().positive(),
	tiles: z.number().int().nonnegative(),
	sheets: z.number().int().nonnegative()
});
export type TrickplayGeometry = z.infer<typeof TrickplayGeometry>;

export const TrickplayStatus = z.enum(['ready', 'generating', 'queued', 'failed']);
export type TrickplayStatus = z.infer<typeof TrickplayStatus>;

/**
 * Make sprite sheets for a video (idempotent, single-flight per file identity;
 * sheets are cached on the device). Answered with `resp` carrying
 * `TrickplayEnsureResult`. `high` = a viewer is waiting (first play), `low` =
 * the admin bulk job; the gateway keeps one lane per priority.
 */
export const TrickplayEnsureMessage = base.extend({
	type: z.literal('trickplay.ensure'),
	rootPath: z.string().min(1),
	relPath: z.string().min(1),
	priority: z.enum(['high', 'low']).default('low')
});
export type TrickplayEnsureMessage = z.infer<typeof TrickplayEnsureMessage>;

export const TrickplayEnsureResult = z.object({
	status: TrickplayStatus,
	geometry: TrickplayGeometry.optional(),
	error: z.string().optional()
});
export type TrickplayEnsureResult = z.infer<typeof TrickplayEnsureResult>;

/**
 * Fetch one sprite sheet (JPEG) — answered like `file.read`. While the file is
 * still generating, the gateway waits briefly for the next sheet to land and
 * fails fast for ones further ahead.
 */
export const TrickplayGetMessage = base.extend({
	type: z.literal('trickplay.get'),
	rootPath: z.string().min(1),
	relPath: z.string().min(1),
	sheet: z.number().int().nonnegative()
});
export type TrickplayGetMessage = z.infer<typeof TrickplayGetMessage>;

export const HubMessage = z.discriminatedUnion('type', [
	WelcomeMessage,
	PongMessage,
	ScanStartMessage,
	FileReadMessage,
	CreditMessage,
	CancelMessage,
	SessionStartMessage,
	SessionStopMessage,
	HlsGetMessage,
	SubtitleGetMessage,
	SubtitlePutMessage,
	TrickplayEnsureMessage,
	TrickplayGetMessage
]);
export type HubMessage = z.infer<typeof HubMessage>;

/* ---------- parsing helpers ---------- */

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return { ok: false, error: 'invalid JSON' };
	}
	const result = schema.safeParse(json);
	if (!result.success) return { ok: false, error: z.prettifyError(result.error) };
	return { ok: true, message: result.data };
}

/** Parse a text frame received BY the hub (i.e. sent by an gateway). */
export function parseGatewayMessage(raw: string): ParseResult<GatewayMessage> {
	return parseWith(GatewayMessage, raw);
}

/** Parse a text frame received BY an gateway (i.e. sent by the hub). */
export function parseHubMessage(raw: string): ParseResult<HubMessage> {
	return parseWith(HubMessage, raw);
}

export const DEFAULT_LIMITS: HubLimits = {
	maxConcurrentTransfers: 4,
	maxTranscodeSessions: 2,
	chunkBytes: 256 * 1024,
	creditWindowBytes: 8 * 1024 * 1024
};
