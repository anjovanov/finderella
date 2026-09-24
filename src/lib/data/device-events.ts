/**
 * The Devices page's activity log — client-safe types and wording. The schema
 * (`device_event`) imports the type list from here.
 */

export const DEVICE_EVENT_TYPES = [
	'device.paired',
	'device.renamed',
	'device.revoked',
	'library.added',
	'library.removed',
	'scan.started',
	'scan.finished',
	'thumbnails.started',
	'thumbnails.finished'
] as const;
export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

export interface DeviceEventEntry {
	id: string;
	type: DeviceEventType;
	at: string;
	/** The admin who acted (snapshot, kept if the account is deleted); null = automatic. */
	actorName: string | null;
	gatewayName: string | null;
	libraryName: string | null;
	detail: Record<string, unknown>;
}

export const DEVICE_EVENT_LABELS: Record<DeviceEventType, string> = {
	'device.paired': 'Device paired',
	'device.renamed': 'Device renamed',
	'device.revoked': 'Device revoked',
	'library.added': 'Library added',
	'library.removed': 'Library removed',
	'scan.started': 'Scan started',
	'scan.finished': 'Scan finished',
	'thumbnails.started': 'Thumbnails started',
	'thumbnails.finished': 'Thumbnails finished'
};

/** Which part of the system an event is about (drives the icon and tint). */
export function deviceEventGroup(
	type: DeviceEventType
): 'device' | 'library' | 'scan' | 'thumbnails' {
	return type.split('.')[0] as 'device' | 'library' | 'scan' | 'thumbnails';
}

function num(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

function plural(n: number, word: string): string {
	return `${n.toLocaleString('en-US')} ${n === 1 ? word : `${word}s`}`;
}

/** "1m 5s", "12s", "2h 3m" — how long a scan or job ran. */
export function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h) return m ? `${h}h ${m}m` : `${h}h`;
	if (m) return sec ? `${m}m ${sec}s` : `${m}m`;
	return `${sec}s`;
}

/** One line of detail for an entry, or null when the event says it all. */
export function describeDeviceEvent(
	entry: Pick<DeviceEventEntry, 'type' | 'detail'>
): string | null {
	const d = entry.detail;
	switch (entry.type) {
		case 'device.renamed': {
			const from = str(d.from);
			const to = str(d.to);
			return from && to ? `${from} → ${to}` : null;
		}
		case 'library.added': {
			const kind = d.kind === 'series' ? 'Series' : d.kind === 'movie' ? 'Movies' : null;
			const path = str(d.rootPath);
			return [kind, path].filter(Boolean).join(' · ') || null;
		}
		case 'library.removed': {
			const files = num(d.files);
			return files === null ? null : `${plural(files, 'file')} left the catalog`;
		}
		case 'scan.started':
			return d.reason === 'library-added' ? 'First scan of a new library' : null;
		case 'scan.finished': {
			const parts: string[] = [];
			const files = num(d.files);
			const errors = num(d.errors);
			const ms = num(d.durationMs);
			if (files !== null) parts.push(`${plural(files, 'file')} found`);
			if (errors) parts.push(plural(errors, 'error'));
			if (ms !== null) parts.push(`took ${formatElapsed(ms)}`);
			return parts.join(' · ') || null;
		}
		case 'thumbnails.finished': {
			const parts: string[] = [];
			if (d.stopped === true) parts.push('Stopped early');
			const generated = num(d.generated);
			const ready = num(d.alreadyReady);
			const failed = num(d.failed);
			const ms = num(d.durationMs);
			if (generated !== null) parts.push(`${generated.toLocaleString('en-US')} generated`);
			if (ready) parts.push(`${ready.toLocaleString('en-US')} already had them`);
			if (failed) parts.push(`${failed.toLocaleString('en-US')} failed`);
			if (ms !== null) parts.push(`took ${formatElapsed(ms)}`);
			const error = str(d.error);
			if (error) parts.push(error);
			return parts.join(' · ') || null;
		}
		default:
			return null;
	}
}
