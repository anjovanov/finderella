import { posix, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isInside, resolveInRoot } from './paths.js';

describe('isInside (posix)', () => {
	it('accepts the root and anything below it', () => {
		expect(isInside('/media', '/media', posix)).toBe(true);
		expect(isInside('/media', '/media/Movies/a.mkv', posix)).toBe(true);
		expect(isInside('/media', '/media/..hidden/a.mkv', posix)).toBe(true);
	});

	it('refuses siblings and parents', () => {
		expect(isInside('/media', '/media2/a.mkv', posix)).toBe(false);
		expect(isInside('/media', '/', posix)).toBe(false);
		expect(isInside('/media/Movies', '/media/Shows/a.mkv', posix)).toBe(false);
	});

	it('works for a library at the filesystem root', () => {
		expect(isInside('/', '/srv/a.mkv', posix)).toBe(true);
	});
});

describe('isInside (win32)', () => {
	it('works for a library at a drive root', () => {
		expect(isInside('E:\\', 'E:\\Movies\\a.mkv', win32)).toBe(true);
		expect(isInside('E:\\', 'E:\\', win32)).toBe(true);
	});

	it('refuses other drives and parents', () => {
		expect(isInside('E:\\Media', 'D:\\Media\\a.mkv', win32)).toBe(false);
		expect(isInside('E:\\Media', 'E:\\Other\\a.mkv', win32)).toBe(false);
		expect(isInside('E:\\Media', 'E:\\Media2\\a.mkv', win32)).toBe(false);
	});

	it('handles UNC shares', () => {
		expect(isInside('\\\\nas\\media', '\\\\nas\\media\\Movies\\a.mkv', win32)).toBe(true);
		expect(isInside('\\\\nas\\media', '\\\\nas\\other\\a.mkv', win32)).toBe(false);
	});
});

describe('resolveInRoot', () => {
	it('resolves forward-slash relPaths on both platforms', () => {
		expect(resolveInRoot('/media', 'Movies/a.mkv', posix)).toBe('/media/Movies/a.mkv');
		expect(resolveInRoot('E:\\', 'Movies/a.mkv', win32)).toBe('E:\\Movies\\a.mkv');
	});

	it('refuses traversal', () => {
		expect(resolveInRoot('/media', '../etc/passwd', posix)).toBeNull();
		expect(resolveInRoot('E:\\Media', '..\\secret.txt', win32)).toBeNull();
		expect(resolveInRoot('E:\\Media', 'D:\\secret.txt', win32)).toBeNull();
	});

	it('refuses relative roots', () => {
		expect(resolveInRoot('media', 'a.mkv', posix)).toBeNull();
		expect(resolveInRoot('Movies', 'a.mkv', win32)).toBeNull();
	});
});
