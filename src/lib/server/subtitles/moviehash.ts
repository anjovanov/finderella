import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { mediaFile } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import type { MediaFileRow } from '$lib/server/streaming/compat';

/**
 * OpenSubtitles "moviehash": file size plus every little-endian uint64 of the
 * first and last 64 KiB, modulo 2^64, as 16 hex digits. Identifies the exact
 * encode, so a subtitle uploaded against the same hash is in sync. Computed
 * hub-side from two range reads over the tunnel (no gateway change) and
 * stored on media_file until the file's size/mtime changes.
 */

export const MOVIEHASH_CHUNK = 64 * 1024;
const MASK64 = (1n << 64n) - 1n;

export function movieHashFromChunks(size: number, head: Uint8Array, tail: Uint8Array): string {
	let sum = BigInt(size);
	for (const chunk of [head, tail]) {
		const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
		const whole = chunk.byteLength - (chunk.byteLength % 8);
		for (let i = 0; i < whole; i += 8) sum = (sum + view.getBigUint64(i, true)) & MASK64;
	}
	return sum.toString(16).padStart(16, '0');
}

async function readRange(
	gatewayId: string,
	rootPath: string,
	relPath: string,
	offset: number,
	length: number
): Promise<Uint8Array> {
	const stream = registry.openByteStream(
		gatewayId,
		{ type: 'file.read', rootPath, relPath, offset, length },
		undefined,
		{ firstByteTimeoutMs: 15_000 }
	);
	const parts: Uint8Array[] = [];
	let total = 0;
	const reader = stream.getReader();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		parts.push(value);
		total += value.byteLength;
		if (total >= length) break;
	}
	await reader.cancel().catch(() => {});
	const out = new Uint8Array(Math.min(total, length));
	let at = 0;
	for (const part of parts) {
		const take = Math.min(part.byteLength, out.byteLength - at);
		out.set(part.subarray(0, take), at);
		at += take;
		if (at >= out.byteLength) break;
	}
	return out;
}

/** Compute the hash over the tunnel; null when the file is too small or unreadable. */
export async function computeMovieHash(
	file: MediaFileRow,
	rootPath: string
): Promise<string | null> {
	if (file.size < MOVIEHASH_CHUNK) return null;
	const tailOffset = Math.max(0, file.size - MOVIEHASH_CHUNK);
	const [head, tail] = await Promise.all([
		readRange(file.gatewayId, rootPath, file.relPath, 0, MOVIEHASH_CHUNK),
		readRange(file.gatewayId, rootPath, file.relPath, tailOffset, MOVIEHASH_CHUNK)
	]);
	if (head.byteLength < MOVIEHASH_CHUNK || tail.byteLength < MOVIEHASH_CHUNK) return null;
	return movieHashFromChunks(file.size, head, tail);
}

/**
 * The stored hash, else compute + store it when the device is online. Best
 * effort: a failure only means the search goes out without a hash.
 */
export async function ensureMovieHash(
	file: MediaFileRow,
	rootPath: string
): Promise<string | null> {
	if (file.moviehash) return file.moviehash;
	if (!registry.isOnline(file.gatewayId)) return null;
	try {
		const hash = await computeMovieHash(file, rootPath);
		if (!hash) return null;
		await db
			.update(mediaFile)
			.set({ moviehash: hash, moviehashAt: new Date() })
			.where(eq(mediaFile.id, file.id));
		file.moviehash = hash;
		return hash;
	} catch (err) {
		log.warn({ err, fileId: file.id }, 'moviehash computation failed');
		return null;
	}
}
