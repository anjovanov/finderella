import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { walkLibrary } from './scanner.js';

const isWindows = process.platform === 'win32';

let base: string;
let root: string;

async function touch(path: string): Promise<void> {
	await writeFile(path, '');
}

async function walk(): Promise<{ videos: string[]; errors: string[] }> {
	const videos: string[] = [];
	const errors: string[] = [];
	for await (const entry of walkLibrary(root, (dir) => errors.push(dir))) {
		videos.push(relative(root, entry.absPath).split(sep).join('/'));
	}
	return { videos: videos.sort(), errors };
}

beforeEach(async () => {
	base = await mkdtemp(join(tmpdir(), 'finderella-scan-'));
	root = join(base, 'library');
	await mkdir(join(root, 'Movies'), { recursive: true });
	await touch(join(root, 'Movies', 'A (2020).mkv'));
});

afterEach(async () => {
	await rm(base, { recursive: true, force: true });
});

describe('walkLibrary', () => {
	it('skips OS housekeeping folders at the root', async () => {
		for (const junk of ['$RECYCLE.BIN', 'System Volume Information', 'lost+found', '@eaDir']) {
			await mkdir(join(root, junk));
			await touch(join(root, junk, 'Deleted.mkv'));
		}
		expect(await walk()).toEqual({ videos: ['Movies/A (2020).mkv'], errors: [] });
	});

	it('follows a symlinked folder (a junction on Windows) and reports it under the link', async () => {
		const outside = join(base, 'disk2');
		await mkdir(outside);
		await touch(join(outside, 'B (2021).mkv'));
		await symlink(outside, join(root, 'Linked'), isWindows ? 'junction' : 'dir');
		expect((await walk()).videos).toEqual(['Linked/B (2021).mkv', 'Movies/A (2020).mkv']);
	});

	it.skipIf(isWindows)('follows symlinked files and skips dangling links', async () => {
		await touch(join(base, 'C (2022).mkv'));
		await symlink(join(base, 'C (2022).mkv'), join(root, 'Movies', 'C (2022).mkv'));
		await symlink(join(base, 'missing.mkv'), join(root, 'Movies', 'Gone.mkv'));
		expect(await walk()).toEqual({
			videos: ['Movies/A (2020).mkv', 'Movies/C (2022).mkv'],
			errors: []
		});
	});

	it('stops at a link cycle', async () => {
		await symlink(root, join(root, 'Movies', 'loop'), isWindows ? 'junction' : 'dir');
		expect(await walk()).toEqual({ videos: ['Movies/A (2020).mkv'], errors: [] });
	});
});
