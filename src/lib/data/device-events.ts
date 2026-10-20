/**
 * The Devices page's activity log — client-safe types and wording. The schema
 * (`device_event`) imports the type list from here. Events are stored as data
 * (type + detail) and worded here at display time, in the viewer's language.
 */

import { labelTable } from '$lib/labels';
import plural from '$lib/plural';
import { formatUnits } from './time';

export const DEVICE_EVENT_TYPES = [
	'device.paired',
	'device.renamed',
	'device.revoked',
	'library.added',
	'library.removed',
	'scan.started',
	'scan.finished',
	'thumbnails.started',
	'thumbnails.finished',
	'markers.started',
	'markers.finished'
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

/** Why an automatic scan ran (`scan.finished` detail.reason). */
function scanTrigger(reason: string | null): string | null {
	if (reason === 'watch') return 'Files changed on the device';
	if (reason === 'scheduled') return 'Scheduled rescan';
	if (reason === 'reconnect') return 'Device reconnected';
	return null;
}

export const DEVICE_EVENT_LABELS: Record<DeviceEventType, string> = labelTable({
	'device.paired': () => 'Device paired',
	'device.renamed': () => 'Device renamed',
	'device.revoked': () => 'Device revoked',
	'library.added': () => 'Library added',
	'library.removed': () => 'Library removed',
	'scan.started': () => 'Scan started',
	'scan.finished': () => 'Scan finished',
	'thumbnails.started': () => 'Thumbnails started',
	'thumbnails.finished': () => 'Thumbnails finished',
	'markers.started': () => 'Intro & credits detection started',
	'markers.finished': () => 'Intro & credits detection finished'
});

/** Which part of the system an event is about (drives the icon and tint). */
export type DeviceEventGroup = 'device' | 'library' | 'scan' | 'thumbnails' | 'markers';

export function deviceEventGroup(type: DeviceEventType): DeviceEventGroup {
	return type.split('.')[0] as DeviceEventGroup;
}

function num(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

/** "1m 5s", "12s", "2h 3m" — how long a scan or job ran (seconds dropped from an hour up). */
export function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	const hours = Math.floor(s / 3600);
	return formatUnits(
		{ hours, minutes: Math.floor((s % 3600) / 60), seconds: hours ? 0 : s % 60 },
		'seconds'
	);
}

/** "took 1m 5s" — the last part of a finished scan or job. */
function took(ms: number): string {
	return /* @wc-include */ `took ${formatElapsed(ms)}`;
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
			return files === null
				? null
				: plural(files, ['# file left the catalog', '# files left the catalog']);
		}
		case 'scan.started':
			return d.reason === 'library-added'
				? 'First scan of a new library'
				: d.reason === 'full-rescan'
					? 'Full rescan: every file re-read'
					: null;
		case 'scan.finished': {
			const parts: string[] = [];
			const trigger = scanTrigger(str(d.reason));
			const files = num(d.files);
			const changed = num(d.changed);
			const missing = num(d.missing);
			const errors = num(d.errors);
			const ms = num(d.durationMs);
			if (trigger) parts.push(trigger);
			// Counts go through plural() even where English has one form, so a
			// translation can agree with the number.
			if (changed) parts.push(plural(changed, ['# new or changed', '# new or changed']));
			if (missing) parts.push(plural(missing, ['# missing', '# missing']));
			if (files !== null) parts.push(plural(files, ['# file found', '# files found']));
			if (d.incomplete === true) parts.push(/* @wc-include */ 'some folders couldn’t be read');
			if (errors) parts.push(plural(errors, ['# error', '# errors']));
			if (ms !== null) parts.push(took(ms));
			return parts.join(' · ') || null;
		}
		case 'thumbnails.finished': {
			const parts: string[] = [];
			if (d.stopped === true) parts.push('Stopped early');
			const generated = num(d.generated);
			const ready = num(d.alreadyReady);
			const failed = num(d.failed);
			const ms = num(d.durationMs);
			if (generated !== null) parts.push(plural(generated, ['# generated', '# generated']));
			if (ready) parts.push(plural(ready, ['# already had them', '# already had them']));
			if (failed) parts.push(plural(failed, ['# failed', '# failed']));
			if (ms !== null) parts.push(took(ms));
			const error = str(d.error);
			if (error) parts.push(error);
			return parts.join(' · ') || null;
		}
		case 'markers.finished': {
			const parts: string[] = [];
			if (d.stopped === true) parts.push('Stopped early');
			const processed = num(d.processed);
			const intros = num(d.intros);
			const credits = num(d.credits);
			const failed = num(d.failed);
			const ms = num(d.durationMs);
			if (processed !== null)
				parts.push(plural(processed, ['# file analysed', '# files analysed']));
			if (intros !== null) parts.push(plural(intros, ['# intro', '# intros']));
			if (credits !== null) parts.push(plural(credits, ['# with credits', '# with credits']));
			if (failed) parts.push(plural(failed, ['# failed', '# failed']));
			if (ms !== null) parts.push(took(ms));
			return parts.join(' · ') || null;
		}
		default:
			return null;
	}
}
