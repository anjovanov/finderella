/**
 * Library folder paths are typed by an admin for a device that may run any
 * OS, so they're checked by shape, not with the hub's own `node:path`:
 * `/mnt/media`, `D:\Movies` / `D:/Movies`, or a UNC share `\\nas\media`.
 */
export function isAbsoluteLibraryPath(path: string): boolean {
	return /^\//.test(path) || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path);
}

/** Default library name: the path's last folder (`D:\Media\Movies` → `Movies`), or the path itself. */
export function libraryNameFromPath(path: string): string {
	return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
