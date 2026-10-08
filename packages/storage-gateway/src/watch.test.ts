import { EventEmitter } from 'node:events';
import type { FSWatcher, WatchListener } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryWatcher, isRelevantChange } from './watch.js';

describe('isRelevantChange', () => {
	it('counts media files and unknown names (folders)', () => {
		expect(isRelevantChange('Movie (2020)/Movie.mkv')).toBe(true);
		expect(isRelevantChange('Show/Season 1/S01E01.en.srt')).toBe(true);
		expect(isRelevantChange('Movie (2020)')).toBe(true);
		expect(isRelevantChange('Blade.Runner.2049.2017.1080p.BluRay.x264-GRP')).toBe(true);
		expect(isRelevantChange(null)).toBe(true);
	});

	it('skips dot paths and files a scan never reads', () => {
		expect(isRelevantChange('.DS_Store')).toBe(false);
		expect(isRelevantChange('.trash/Movie.mkv')).toBe(false);
		expect(isRelevantChange('Movie (2020)/movie.nfo')).toBe(false);
		expect(isRelevantChange('Movie (2020)/poster.JPG')).toBe(false);
		expect(isRelevantChange('Movie (2020)/Movie.mkv.part')).toBe(false);
	});

	it('handles Windows separators', () => {
		expect(isRelevantChange('Movie\\.hidden\\a.mkv')).toBe(false);
		expect(isRelevantChange('Movie\\a.mkv')).toBe(true);
	});
});

class FakeWatcher extends EventEmitter {
	closed = false;
	close() {
		this.closed = true;
	}
}

function setup() {
	const watchers = new Map<string, { watcher: FakeWatcher; listener: WatchListener<string> }>();
	const changes: string[] = [];
	const watch = vi.fn(
		(root: string, _opts: { recursive: boolean }, listener: WatchListener<string>) => {
			const watcher = new FakeWatcher();
			watchers.set(root, { watcher, listener });
			return watcher as unknown as FSWatcher;
		}
	);
	const lib = new LibraryWatcher({
		onChange: (id) => changes.push(id),
		log: () => {},
		watch,
		quietMs: 1_000,
		retryMs: 60_000
	});
	return { lib, watch, watchers, changes };
}

describe('LibraryWatcher', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('reports a burst of changes once, after the quiet period', () => {
		const { lib, watchers, changes } = setup();
		lib.setLibraries([{ libraryId: 'l1', rootPath: '/media/movies' }]);
		const { listener } = watchers.get('/media/movies')!;
		listener('rename', 'A/a.mkv');
		vi.advanceTimersByTime(900);
		listener('change', 'A/a.mkv');
		vi.advanceTimersByTime(900);
		expect(changes).toEqual([]);
		vi.advanceTimersByTime(100);
		expect(changes).toEqual(['l1']);
	});

	it('ignores irrelevant events', () => {
		const { lib, watchers, changes } = setup();
		lib.setLibraries([{ libraryId: 'l1', rootPath: '/m' }]);
		watchers.get('/m')!.listener('change', 'A/movie.nfo');
		vi.advanceTimersByTime(5_000);
		expect(changes).toEqual([]);
	});

	it('keeps unchanged roots and closes removed or moved ones', () => {
		const { lib, watch, watchers, changes } = setup();
		lib.setLibraries([
			{ libraryId: 'l1', rootPath: '/a' },
			{ libraryId: 'l2', rootPath: '/b' }
		]);
		const a = watchers.get('/a')!;
		const b = watchers.get('/b')!;
		b.listener('rename', 'x.mkv');
		lib.setLibraries([
			{ libraryId: 'l1', rootPath: '/a' },
			{ libraryId: 'l3', rootPath: '/c' }
		]);
		expect(watch).toHaveBeenCalledTimes(3);
		expect(a.watcher.closed).toBe(false);
		expect(b.watcher.closed).toBe(true);
		// The removed library's pending report is dropped.
		vi.advanceTimersByTime(5_000);
		expect(changes).toEqual([]);
	});

	it('retries a failed watcher and reports a change once it is back', () => {
		const { lib, watch, watchers, changes } = setup();
		lib.setLibraries([{ libraryId: 'l1', rootPath: '/m' }]);
		const first = watchers.get('/m')!.watcher;
		first.emit('error', Object.assign(new Error('no space'), { code: 'ENOSPC' }));
		expect(first.closed).toBe(true);
		vi.advanceTimersByTime(60_000);
		expect(watch).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(1_000);
		expect(changes).toEqual(['l1']);
	});

	it('retries when the root cannot be watched at all', () => {
		const { lib, watch } = setup();
		watch.mockImplementationOnce(() => {
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		});
		lib.setLibraries([{ libraryId: 'l1', rootPath: '/gone' }]);
		vi.advanceTimersByTime(60_000);
		expect(watch).toHaveBeenCalledTimes(2);
	});

	it('closeAll stops everything', () => {
		const { lib, watchers, changes } = setup();
		lib.setLibraries([{ libraryId: 'l1', rootPath: '/m' }]);
		const { watcher, listener } = watchers.get('/m')!;
		listener('rename', 'a.mkv');
		lib.closeAll();
		vi.advanceTimersByTime(5_000);
		expect(watcher.closed).toBe(true);
		expect(changes).toEqual([]);
	});
});
