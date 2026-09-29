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
	/** The gateway can analyse files for intro/credits markers. */
	markers: boolean;
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

/** Why "Detect intros & credits" can't run for a library right now, or null when it can. */
export function markersBlocker(
	device: Pick<Device, 'online' | 'markers'>,
	opts: { enabled: boolean; jobRunning: boolean }
): string | null {
	if (!opts.enabled) return 'Turned off in Site settings';
	if (!device.markers) return 'Update the gateway on this device first';
	if (!device.online) return 'Device is offline';
	if (opts.jobRunning) return 'A detection run is in progress';
	return null;
}

/** What every admin background-job snapshot has (rendered by job-card.svelte). */
export interface JobSnapshot {
	running: boolean;
	libraryName: string | null;
	finishedAt: string | null;
	total: number;
	processed: number;
	current: string | null;
	stopRequested: boolean;
	recent: { at: string; level: 'info' | 'warn' | 'error'; message: string }[];
	lastError: string | null;
}

/** The admin thumbnail job snapshot (mirrors `TrickplayBulkStatus`, which lives server-side). */
export interface ThumbnailJob extends JobSnapshot {
	generated: number;
	alreadyReady: number;
	failed: number;
	skipped: number;
}

/** The intro/credits job snapshot (mirrors `MarkersJobStatus`, which lives server-side). */
export interface MarkersJob extends JobSnapshot {
	intros: number;
	credits: number;
	failed: number;
	waiting: number;
}
