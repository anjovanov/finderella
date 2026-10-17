/**
 * Folders operating systems and NAS boxes keep at drive/share roots. They're
 * never media, and the unreadable ones (`System Volume Information`,
 * `lost+found`) would make every scan of a drive-root library `incomplete`,
 * so the hub would never mark deleted files missing. Dot-folders (`.Trashes`,
 * `.Spotlight-V100`) are skipped separately by their leading dot.
 */
const IGNORED_DIR_NAMES = new Set([
	'$recycle.bin',
	'system volume information',
	'lost+found',
	'@eadir',
	'#recycle',
	'#snapshot'
]);

/** Whether a folder name (any case) is OS/NAS housekeeping the scanner skips. */
export function isIgnoredDirName(name: string): boolean {
	return IGNORED_DIR_NAMES.has(name.toLowerCase());
}
