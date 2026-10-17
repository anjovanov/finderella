import path from 'node:path';

type PathImpl = Pick<typeof path, 'relative' | 'isAbsolute' | 'resolve' | 'sep'>;

/**
 * Whether `abs` is `root` or lies inside it. Built on `relative`, never on
 * `startsWith(root + sep)`: a drive or mount root already ends in a separator
 * (`E:\`, `/`), and on Windows a path on another drive comes back absolute.
 * `p` is injectable so tests can exercise win32 semantics on any OS.
 */
export function isInside(root: string, abs: string, p: PathImpl = path): boolean {
	const rel = p.relative(root, abs);
	if (rel === '') return true;
	if (rel === '..' || rel.startsWith(`..${p.sep}`)) return false;
	return !p.isAbsolute(rel);
}

/**
 * Resolve a hub-supplied library-relative path, or null when it escapes the
 * root. A relative root is refused too: it would resolve against the
 * service's working directory, which differs between systemd, launchd and
 * Task Scheduler.
 */
export function resolveInRoot(root: string, relPath: string, p: PathImpl = path): string | null {
	if (!p.isAbsolute(root)) return null;
	const abs = p.resolve(root, relPath);
	return isInside(root, abs, p) ? abs : null;
}
