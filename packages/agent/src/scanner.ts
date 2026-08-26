import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { VIDEO_EXTENSIONS, type ProbedFile, type ScanStartMessage } from '@finderella/protocol';
import type { AgentConnection } from './connection.js';
import { probeFile } from './probe.js';

const BATCH_SIZE = 25;
const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS);

async function* walkVideoFiles(root: string): AsyncGenerator<string> {
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch (err) {
		throw new Error(`cannot read ${root}: ${(err as Error).message}`, { cause: err });
	}
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const full = join(root, entry.name);
		if (entry.isDirectory()) {
			yield* walkVideoFiles(full);
		} else if (entry.isFile() && VIDEO_EXTENSION_SET.has(extname(entry.name).toLowerCase())) {
			yield full;
		}
	}
}

/**
 * Walk a library root, probe each video file (when ffprobe exists), and
 * report batches back to the hub. WS frames are ordered, so `scan.done`
 * always arrives after every `scan.file` batch.
 */
export async function runScan(
	conn: AgentConnection,
	msg: ScanStartMessage,
	opts: { ffprobe: boolean; log: (m: string) => void }
): Promise<void> {
	const { libraryId, rootPath } = msg;
	opts.log(`scanning ${rootPath} (library ${libraryId})`);
	let batch: ProbedFile[] = [];
	let files = 0;
	let errors = 0;

	const flush = () => {
		if (batch.length === 0) return;
		conn.send({ type: 'scan.file', libraryId, files: batch });
		batch = [];
	};

	try {
		for await (const absPath of walkVideoFiles(rootPath)) {
			try {
				const info = await stat(absPath);
				const probed = opts.ffprobe ? await probeFile(absPath) : {};
				batch.push({
					relPath: relative(rootPath, absPath).split(sep).join('/'),
					size: info.size,
					// fs.stat reports fractional ms; the hub stores bigint.
					mtimeMs: Math.round(info.mtimeMs),
					container: extname(absPath).slice(1).toLowerCase(),
					...probed
				});
				files++;
				if (batch.length >= BATCH_SIZE) flush();
			} catch (err) {
				errors++;
				opts.log(`failed to scan ${absPath}: ${(err as Error).message}`);
			}
		}
	} catch (err) {
		errors++;
		opts.log(`scan aborted: ${(err as Error).message}`);
	}
	flush();
	conn.send({ type: 'scan.done', libraryId, stats: { files, errors } });
	opts.log(`scan finished: ${files} files, ${errors} errors`);
}
