import { watch as fsWatch, type FSWatcher, type WatchListener } from 'node:fs';
import { extname } from 'node:path';
import { SUBTITLE_EXTENSIONS, VIDEO_EXTENSIONS } from '@finderella/protocol';

/** Quiet period after the last change before the hub hears about it (a long copy keeps resetting it). */
const QUIET_MS = 30_000;
/** A watcher that failed (root unmounted, inotify limit) is retried this often. */
const RETRY_MS = 5 * 60_000;

const MEDIA_EXTENSIONS = new Set<string>([...VIDEO_EXTENSIONS, ...SUBTITLE_EXTENSIONS]);
/**
 * Files that never change what a scan finds. Anything else counts: folder
 * names are full of dots (`Blade.Runner.2049.2017.1080p`), and a folder moved
 * into the library reports only its own name, never the videos inside it.
 */
const IGNORED_EXTENSIONS = new Set([
	'.nfo',
	'.txt',
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.webp',
	'.sfv',
	'.md5',
	'.db',
	'.ini',
	'.url',
	'.part',
	'.tmp',
	'.crdownload',
	'.!qb',
	'.!ut'
]);

/**
 * Whether a watch event (path relative to the library root, or null when the
 * platform doesn't say) can change what a scan finds. Dot-files and anything
 * under a dot-folder are skipped by the scanner, so they're skipped here too.
 */
export function isRelevantChange(filename: string | null): boolean {
	if (filename === null) return true;
	const segments = filename.split(/[\\/]/).filter(Boolean);
	if (segments.length === 0) return true;
	if (segments.some((segment) => segment.startsWith('.'))) return false;
	const ext = extname(segments[segments.length - 1]).toLowerCase();
	return MEDIA_EXTENSIONS.has(ext) || !IGNORED_EXTENSIONS.has(ext);
}

export interface WatchedLibrary {
	libraryId: string;
	rootPath: string;
}

type WatchFn = (
	root: string,
	options: { recursive: boolean },
	listener: WatchListener<string>
) => FSWatcher;

interface Entry extends WatchedLibrary {
	watcher: FSWatcher | null;
	debounce: ReturnType<typeof setTimeout> | null;
	retry: ReturnType<typeof setTimeout> | null;
}

/**
 * Recursive `fs.watch` on each library root the hub asked for; a burst of
 * relevant events becomes one `onChange(libraryId)` after a quiet period.
 * Best effort: network shares usually deliver no events for changes made
 * elsewhere, and the hub's periodic rescans cover what this misses.
 */
export class LibraryWatcher {
	readonly #entries = new Map<string, Entry>();
	readonly #onChange: (libraryId: string) => void;
	readonly #log: (message: string) => void;
	readonly #watch: WatchFn;
	readonly #quietMs: number;
	readonly #retryMs: number;

	constructor(opts: {
		onChange: (libraryId: string) => void;
		log: (message: string) => void;
		watch?: WatchFn;
		quietMs?: number;
		retryMs?: number;
	}) {
		this.#onChange = opts.onChange;
		this.#log = opts.log;
		this.#watch = opts.watch ?? fsWatch;
		this.#quietMs = opts.quietMs ?? QUIET_MS;
		this.#retryMs = opts.retryMs ?? RETRY_MS;
	}

	/** Replace the watched set: unchanged roots keep their watcher, the rest open or close. */
	setLibraries(libraries: WatchedLibrary[]): void {
		const wanted = new Map(libraries.map((lib) => [lib.libraryId, lib]));
		for (const entry of [...this.#entries.values()]) {
			if (wanted.get(entry.libraryId)?.rootPath !== entry.rootPath) this.#remove(entry);
		}
		for (const lib of wanted.values()) {
			if (this.#entries.has(lib.libraryId)) continue;
			const entry: Entry = { ...lib, watcher: null, debounce: null, retry: null };
			this.#entries.set(lib.libraryId, entry);
			this.#open(entry);
		}
	}

	closeAll(): void {
		for (const entry of [...this.#entries.values()]) this.#remove(entry);
	}

	#open(entry: Entry): void {
		try {
			const watcher = this.#watch(entry.rootPath, { recursive: true }, (_event, filename) => {
				if (isRelevantChange(filename)) this.#touch(entry);
			});
			watcher.on('error', (err) => this.#fail(entry, err));
			entry.watcher = watcher;
			this.#log(`watching ${entry.rootPath} for changes`);
		} catch (err) {
			this.#fail(entry, err as Error);
		}
	}

	#touch(entry: Entry): void {
		if (entry.debounce) clearTimeout(entry.debounce);
		entry.debounce = setTimeout(() => {
			entry.debounce = null;
			this.#onChange(entry.libraryId);
		}, this.#quietMs);
		entry.debounce.unref?.();
	}

	#fail(entry: Entry, err: Error): void {
		const code = (err as NodeJS.ErrnoException).code;
		const hint =
			code === 'ENOSPC' ? ' (inotify watch limit reached: raise fs.inotify.max_user_watches)' : '';
		this.#log(
			`cannot watch ${entry.rootPath}: ${err.message}${hint}; retrying in ${Math.round(this.#retryMs / 60_000)} min`
		);
		entry.watcher?.close();
		entry.watcher = null;
		if (entry.retry || this.#entries.get(entry.libraryId) !== entry) return;
		entry.retry = setTimeout(() => {
			entry.retry = null;
			if (this.#entries.get(entry.libraryId) !== entry) return;
			this.#open(entry);
			// Changes made while the watch was down went unseen: let the hub rescan once.
			if (entry.watcher) this.#touch(entry);
		}, this.#retryMs);
		entry.retry.unref?.();
	}

	#remove(entry: Entry): void {
		this.#entries.delete(entry.libraryId);
		if (entry.debounce) clearTimeout(entry.debounce);
		if (entry.retry) clearTimeout(entry.retry);
		if (entry.watcher) {
			entry.watcher.close();
			this.#log(`stopped watching ${entry.rootPath}`);
		}
	}
}
