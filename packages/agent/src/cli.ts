#!/usr/bin/env node
import { resolve, sep } from 'node:path';
import { Command } from 'commander';
import { DEFAULT_LIMITS } from '@finderella/protocol';
import { AgentConnection } from './connection.js';
import { configPath, loadConfig, saveConfig } from './config.js';
import { FileTransfer } from './file-reader.js';
import { detectTools, ffmpegPath } from './probe.js';
import { runScan } from './scanner.js';
import { TranscodeSession } from './transcode/session.js';

const log = (message: string) => console.log(`[agent] ${message}`);

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
		const res = await fetch(new URL('/api/agent/pair', opts.hub), {
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
		const data = (await res.json()) as { agentId: string; name: string; token: string };
		saveConfig({ hubUrl: opts.hub, token: data.token, agentId: data.agentId, name: data.name });
		log(`paired as "${data.name}" (${data.agentId})`);
		log(`token saved to ${configPath()}`);
		log(`start serving with: finderella-storage-gateway connect`);
	});

program
	.command('connect')
	.description('Connect to the Finderella hub and stay online')
	.option('--hub <url>', 'hub base URL (defaults to saved config)')
	.option('--token <token>', 'agent token (defaults to saved config / env)')
	.action(async (opts: { hub?: string; token?: string }) => {
		const saved = loadConfig();
		const hubUrl = opts.hub ?? process.env.FINDERELLA_HUB ?? saved?.hubUrl;
		const token =
			opts.token ?? process.env.FINDERELLA_TOKEN ?? process.env.AGENT_DEV_TOKEN ?? saved?.token;
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

		const transfers = new Map<number, FileTransfer>();
		const sessions = new Map<string, TranscodeSession>();

		const startTransfer = (
			conn: AgentConnection,
			requestId: number,
			absPath: string,
			offset: number,
			length: number
		) => {
			const limits = conn.limits ?? DEFAULT_LIMITS;
			if (transfers.size >= limits.maxConcurrentTransfers) {
				conn.send({ type: 'resp', re: requestId, ok: false, error: 'device busy' });
				return;
			}
			const transfer = new FileTransfer(conn, { requestId, absPath, offset, length }, limits);
			transfers.set(requestId, transfer);
			void transfer.run().finally(() => transfers.delete(requestId));
		};

		const connection = new AgentConnection({
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
						const root = resolve(message.rootPath);
						const abs = resolve(root, message.relPath);
						if (abs !== root && !abs.startsWith(root + sep)) {
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
						const root = resolve(message.rootPath);
						const abs = resolve(root, message.relPath);
						if (abs !== root && !abs.startsWith(root + sep)) {
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
							.catch((err: Error) =>
								conn.send({ type: 'resp', re: message.id, ok: false, error: err.message })
							);
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
