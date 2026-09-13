#!/usr/bin/env node
import { lstat, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { Command } from 'commander';
import { DEFAULT_LIMITS, MAX_SUBTITLE_PUT_BYTES, SUBTITLE_EXTENSIONS } from '@finderella/protocol';
import { GatewayConnection } from './connection.js';
import { configPath, loadConfig, saveConfig } from './config.js';
import { FileTransfer, type Transfer } from './file-reader.js';
import { detectTools, ffmpegPath } from './probe.js';
import { runScan } from './scanner.js';
import { StreamTransfer } from './stream-transfer.js';
import { ensureSubtitleVtt, tailSubtitle } from './subtitles/extract.js';
import { TrickplayQueue } from './trickplay/queue.js';

const SUBTITLE_EXTENSION_SET = new Set<string>(SUBTITLE_EXTENSIONS);
/** How long a `trickplay.get` waits for the sheet ffmpeg is writing next. */
const TRICKPLAY_SHEET_WAIT_MS = 20_000;

/**
 * Write a downloaded subtitle beside its video. Only subtitle extensions,
 * only into an existing folder inside the library root, never over an
 * existing file unless asked; written to a temp name and renamed.
 */
async function putSubtitle(
	root: string,
	absPath: string,
	contentBase64: string,
	overwrite: boolean
): Promise<{ size: number; mtimeMs: number }> {
	if (!SUBTITLE_EXTENSION_SET.has(extname(absPath).toLowerCase())) {
		throw new Error('not a subtitle file name');
	}
	const bytes = Buffer.from(contentBase64, 'base64');
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_SUBTITLE_PUT_BYTES) {
		throw new Error('subtitle payload is empty or too large');
	}
	// The folder must really live inside the library: a symlinked folder could
	// otherwise redirect the write anywhere. Anything already at the target
	// path — a dangling symlink included — counts as existing.
	const [realDir, realRoot] = await Promise.all([
		realpath(dirname(absPath)).catch(() => null),
		realpath(root).catch(() => null)
	]);
	if (!realDir || !realRoot) throw new Error('target folder does not exist');
	if (realDir !== realRoot && !realDir.startsWith(realRoot + sep)) {
		throw new Error('target folder is outside the library');
	}
	const dir = await stat(realDir).catch(() => null);
	if (!dir?.isDirectory()) throw new Error('target folder does not exist');
	if (!overwrite && (await lstat(absPath).catch(() => null))) throw new Error('exists');
	const tmp = `${absPath}.${process.pid}.part`;
	await writeFile(tmp, bytes);
	try {
		await rename(tmp, absPath);
	} catch (err) {
		await unlink(tmp).catch(() => {});
		throw err;
	}
	const info = await stat(absPath);
	return { size: info.size, mtimeMs: Math.round(info.mtimeMs) };
}
import { TranscodeSession } from './transcode/session.js';

const log = (message: string) => console.log(`[gateway] ${message}`);

/** Resolve a hub-supplied library-relative path, or null when it escapes the root. */
function resolveInRoot(root: string, relPath: string): string | null {
	const abs = resolve(root, relPath);
	return abs === root || abs.startsWith(root + sep) ? abs : null;
}

const program = new Command();

program
	.name('finderella-storage-gateway')
	.description('Finderella storage gateway (media agent) — serves local media to a Finderella hub')
	.version('0.0.1');

program
	.command('pair')
	.description('Pair this device with a Finderella hub using a claim code from /settings/devices')
	.requiredOption('--hub <url>', 'hub base URL (e.g. https://stream.example.com)')
	.requiredOption('--code <code>', 'pairing code shown in the Finderella UI')
	.option('--name <name>', 'name for this device')
	.action(async (opts: { hub: string; code: string; name?: string }) => {
		const res = await fetch(new URL('/api/gateway/pair', opts.hub), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code: opts.code, name: opts.name })
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => '');
			console.error(`pairing failed (${res.status}): ${detail}`);
			process.exitCode = 1;
			return;
		}
		const data = (await res.json()) as { gatewayId: string; name: string; token: string };
		saveConfig({ hubUrl: opts.hub, token: data.token, gatewayId: data.gatewayId, name: data.name });
		log(`paired as "${data.name}" (${data.gatewayId})`);
		log(`token saved to ${configPath()}`);
		log(`start serving with: finderella-storage-gateway connect`);
	});

program
	.command('connect')
	.description('Connect to the Finderella hub and stay online')
	.option('--hub <url>', 'hub base URL (defaults to saved config)')
	.option('--token <token>', 'gateway token (defaults to saved config / env)')
	.action(async (opts: { hub?: string; token?: string }) => {
		const saved = loadConfig();
		const hubUrl = opts.hub ?? process.env.FINDERELLA_HUB ?? saved?.hubUrl;
		const token =
			opts.token ?? process.env.FINDERELLA_TOKEN ?? process.env.GATEWAY_DEV_TOKEN ?? saved?.token;
		if (!hubUrl || !token) {
			console.error(
				`Missing hub URL or token. Pair first (finderella-storage-gateway pair --hub <url> --code <code>), pass --hub/--token, or set FINDERELLA_HUB/FINDERELLA_TOKEN. Config: ${configPath()}`
			);
			process.exitCode = 1;
			return;
		}

		const tools = await detectTools();
		log(
			tools.capabilities.ffmpeg
				? `ffmpeg ${tools.capabilities.ffmpegVersion ?? ''} detected`
				: 'ffmpeg NOT found — transcoding will be unavailable from this device'
		);
		if (!tools.ffprobe) log('ffprobe NOT found — scans will lack codec/duration metadata');

		const transfers = new Map<number, Transfer>();
		const sessions = new Map<string, TranscodeSession>();
		const trickplay = new TrickplayQueue({ ffmpegBin: ffmpegPath, log });
		// Only file/HLS transfers count against maxConcurrentTransfers: a subtitle
		// stream can idle for minutes and must never make segment fetches "busy".
		let fileTransfers = 0;

		const startTransfer = (
			conn: GatewayConnection,
			requestId: number,
			absPath: string,
			offset: number,
			length: number
		) => {
			const limits = conn.limits ?? DEFAULT_LIMITS;
			if (fileTransfers >= limits.maxConcurrentTransfers) {
				conn.send({ type: 'resp', re: requestId, ok: false, error: 'device busy' });
				return;
			}
			const transfer = new FileTransfer(conn, { requestId, absPath, offset, length }, limits);
			transfers.set(requestId, transfer);
			fileTransfers++;
			void transfer.run().finally(() => {
				transfers.delete(requestId);
				fileTransfers--;
			});
		};

		const connection = new GatewayConnection({
			hubUrl,
			token,
			capabilities: tools.capabilities,
			log,
			onMessage: (message, conn) => {
				switch (message.type) {
					case 'scan.start':
						void runScan(conn, message, { ffprobe: tools.ffprobe, log });
						break;
					case 'file.read': {
						// Never read outside the library root, whatever the hub asks for.
						const abs = resolveInRoot(resolve(message.rootPath), message.relPath);
						if (!abs) {
							conn.send({
								type: 'resp',
								re: message.id,
								ok: false,
								error: 'path escapes library root'
							});
							break;
						}
						startTransfer(conn, message.id, abs, message.offset, message.length);
						break;
					}
					case 'subtitle.get': {
						const root = resolve(message.rootPath);
						const absVideoPath = resolveInRoot(root, message.relPath);
						const absSidecarPath = message.subtitlePath
							? resolveInRoot(root, message.subtitlePath)
							: undefined;
						if (!absVideoPath || absSidecarPath === null) {
							conn.send({
								type: 'resp',
								re: message.id,
								ok: false,
								error: 'path escapes library root'
							});
							break;
						}
						void ensureSubtitleVtt(
							{
								absVideoPath,
								source: message.source,
								streamIndex: message.streamIndex,
								absSidecarPath
							},
							{ ffmpegBin: ffmpegPath(), log }
						)
							.then((handle) => {
								if (handle.complete) {
									startTransfer(conn, message.id, handle.path, 0, Infinity);
									return;
								}
								// Still converting: stream the file as it grows.
								const limits = conn.limits ?? DEFAULT_LIMITS;
								const transfer = new StreamTransfer(conn, message.id, tailSubtitle(handle), limits);
								transfers.set(message.id, transfer);
								void transfer.run().finally(() => transfers.delete(message.id));
							})
							.catch((err: Error) => {
								conn.send({ type: 'resp', re: message.id, ok: false, error: err.message });
							});
						break;
					}
					case 'subtitle.put': {
						const root = resolve(message.rootPath);
						const abs = resolveInRoot(root, message.relPath);
						if (!abs) {
							conn.send({
								type: 'resp',
								re: message.id,
								ok: false,
								error: 'path escapes library root'
							});
							break;
						}
						void putSubtitle(root, abs, message.contentBase64, message.overwrite)
							.then((data) => {
								log(`wrote subtitle ${message.relPath} (${data.size} bytes)`);
								conn.send({ type: 'resp', re: message.id, ok: true, data });
							})
							.catch((err: Error) => {
								conn.send({ type: 'resp', re: message.id, ok: false, error: err.message });
							});
						break;
					}
					case 'trickplay.ensure': {
						const root = resolve(message.rootPath);
						const abs = resolveInRoot(root, message.relPath);
						if (!abs) {
							conn.send({
								type: 'resp',
								re: message.id,
								ok: false,
								error: 'path escapes library root'
							});
							break;
						}
						void trickplay
							.ensure(abs, message.priority)
							.then((data) => conn.send({ type: 'resp', re: message.id, ok: true, data }))
							.catch((err: Error) => {
								conn.send({ type: 'resp', re: message.id, ok: false, error: err.message });
							});
						break;
					}
					case 'trickplay.get': {
						const root = resolve(message.rootPath);
						const abs = resolveInRoot(root, message.relPath);
						if (!abs) {
							conn.send({
								type: 'resp',
								re: message.id,
								ok: false,
								error: 'path escapes library root'
							});
							break;
						}
						const limits = conn.limits ?? DEFAULT_LIMITS;
						const controller = new AbortController();
						let earlyCredit = 0;
						// Placeholder while we wait for the sheet, so a hub `cancel` stops the
						// wait and credits that arrive early aren't lost. Not counted against
						// maxConcurrentTransfers: a hover must never make segment fetches busy.
						transfers.set(message.id, {
							addCredit: (bytes) => {
								earlyCredit += bytes;
							},
							abort: () => controller.abort()
						});
						void trickplay
							.waitForSheet(abs, message.sheet, {
								timeoutMs: TRICKPLAY_SHEET_WAIT_MS,
								signal: controller.signal
							})
							.then((path) => {
								if (controller.signal.aborted) return;
								const transfer = new FileTransfer(
									conn,
									{ requestId: message.id, absPath: path, offset: 0, length: Infinity },
									limits
								);
								if (earlyCredit > 0) transfer.addCredit(earlyCredit);
								transfers.set(message.id, transfer);
								return transfer.run();
							})
							.catch((err: Error) => {
								if (!controller.signal.aborted) {
									conn.send({ type: 'resp', re: message.id, ok: false, error: err.message });
								}
							})
							.finally(() => transfers.delete(message.id));
						break;
					}
					case 'session.start': {
						const ffmpeg = ffmpegPath();
						if (!ffmpeg) {
							conn.send({ type: 'resp', re: message.id, ok: false, error: 'ffmpeg unavailable' });
							break;
						}
						const limits = conn.limits ?? DEFAULT_LIMITS;
						if (sessions.size >= limits.maxTranscodeSessions) {
							conn.send({ type: 'resp', re: message.id, ok: false, error: 'device busy' });
							break;
						}
						const abs = resolveInRoot(resolve(message.rootPath), message.relPath);
						if (!abs) {
							conn.send({
								type: 'resp',
								re: message.id,
								ok: false,
								error: 'path escapes library root'
							});
							break;
						}
						const session = new TranscodeSession({
							sessionId: message.sessionId,
							absPath: abs,
							segmentSeconds: message.segmentSeconds,
							durationMs: message.durationMs,
							quality: message.quality,
							ffmpegBin: ffmpeg,
							log,
							onReap: () => sessions.delete(message.sessionId)
						});
						sessions.set(message.sessionId, session);
						void session
							.start(Math.floor(message.startSeconds / message.segmentSeconds))
							.then(() => conn.send({ type: 'resp', re: message.id, ok: true }))
							.catch((err: Error) => {
								sessions.delete(message.sessionId);
								conn.send({ type: 'resp', re: message.id, ok: false, error: err.message });
							});
						break;
					}
					case 'session.stop': {
						const session = sessions.get(message.sessionId);
						sessions.delete(message.sessionId);
						void session?.stop();
						break;
					}
					case 'hls.get': {
						const session = sessions.get(message.sessionId);
						if (!session) {
							conn.send({ type: 'resp', re: message.id, ok: false, error: 'no such session' });
							break;
						}
						void session
							.ensureAsset(message.name)
							.then((absPath) => startTransfer(conn, message.id, absPath, 0, Infinity))
							.catch((err: Error) => {
								log(`hls.get ${message.name} failed (${message.sessionId}): ${err.message}`);
								conn.send({ type: 'resp', re: message.id, ok: false, error: err.message });
							});
						break;
					}
					case 'credit':
						transfers.get(message.re)?.addCredit(message.bytes);
						break;
					case 'cancel':
						transfers.get(message.re)?.abort();
						break;
				}
			},
			onDisconnect: () => {
				for (const transfer of transfers.values()) transfer.abort();
				transfers.clear();
				for (const session of sessions.values()) void session.stop();
				sessions.clear();
			}
		});
		connection.start();

		const shutdown = () => {
			log('shutting down');
			connection.stop();
			process.exit(0);
		};
		process.on('SIGINT', shutdown);
		process.on('SIGTERM', shutdown);
	});

program.parse();
