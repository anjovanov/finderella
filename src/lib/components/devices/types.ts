/** Shapes the /admin/devices loader returns (kept structural so the components stay route-agnostic). */

export interface DeviceLibrary {
	id: string;
	name: string;
	rootPath: string;
	kind: 'movie' | 'series';
	lastScanAt: string | null;
	files: number;
}

export interface Device {
	id: string;
	name: string;
	online: boolean;
	gatewayVersion: string | null;
	trickplay: boolean;
	lastSeenAt: string | null;
	createdAt: string;
	libraries: DeviceLibrary[];
}

/** Why "Generate trickplay thumbnails" can't run for a library right now, or null when it can. */
export function thumbnailBlocker(
	device: Pick<Device, 'online' | 'trickplay'>,
	opts: { enabled: boolean; jobRunning: boolean }
): string | null {
	if (!opts.enabled) return 'Turned off in Site settings';
	if (!device.trickplay) return 'Update the gateway on this device first';
	if (!device.online) return 'Device is offline';
	if (opts.jobRunning) return 'Another thumbnail job is running';
	return null;
}

/** The admin thumbnail job snapshot (mirrors `TrickplayBulkStatus`, which lives server-side). */
export interface ThumbnailJob {
	running: boolean;
	libraryName: string | null;
	finishedAt: string | null;
	total: number;
	processed: number;
	generated: number;
	alreadyReady: number;
	failed: number;
	skipped: number;
	current: string | null;
	stopRequested: boolean;
	recent: { at: string; level: 'info' | 'warn' | 'error'; message: string }[];
	lastError: string | null;
}
