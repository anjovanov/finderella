import { describe, expect, it } from 'vitest';
import { movieHashFromChunks, MOVIEHASH_CHUNK } from './moviehash';

describe('movieHashFromChunks', () => {
	it('is the size for all-zero chunks and sums little-endian uint64 words otherwise', () => {
		const zeros = new Uint8Array(MOVIEHASH_CHUNK);
		expect(movieHashFromChunks(12909756, zeros, zeros)).toBe(
			(12909756).toString(16).padStart(16, '0')
		);

		const ones = new Uint8Array(MOVIEHASH_CHUNK).fill(0x01);
		const words = BigInt((MOVIEHASH_CHUNK / 8) * 2);
		const expected =
			(BigInt(2 * MOVIEHASH_CHUNK) + words * 0x0101010101010101n) & ((1n << 64n) - 1n);
		expect(movieHashFromChunks(2 * MOVIEHASH_CHUNK, ones, ones)).toBe(
			expected.toString(16).padStart(16, '0')
		);
	});

	it('wraps modulo 2^64 and reads words little-endian', () => {
		const head = new Uint8Array(8).fill(0xff);
		const tail = new Uint8Array(8);
		tail[0] = 0x02; // 0x0000000000000002 little-endian
		// 0xffffffffffffffff + 2 + size(1) wraps to 0x...0002
		expect(movieHashFromChunks(1, head, tail)).toBe('0000000000000002');
	});
});
