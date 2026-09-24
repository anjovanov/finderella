import { describe, expect, it } from 'vitest';
import { describeDeviceEvent, formatElapsed } from './device-events';

describe('formatElapsed', () => {
	it('uses the two largest units', () => {
		expect(formatElapsed(0)).toBe('0s');
		expect(formatElapsed(12_400)).toBe('12s');
		expect(formatElapsed(65_000)).toBe('1m 5s');
		expect(formatElapsed(120_000)).toBe('2m');
		expect(formatElapsed(7_380_000)).toBe('2h 3m');
		expect(formatElapsed(3_600_000)).toBe('1h');
	});
});

describe('describeDeviceEvent', () => {
	it('describes a finished scan with counts and duration', () => {
		expect(
			describeDeviceEvent({
				type: 'scan.finished',
				detail: { files: 22, errors: 0, durationMs: 65_000 }
			})
		).toBe('22 files found · took 1m 5s');
		expect(describeDeviceEvent({ type: 'scan.finished', detail: { files: 1, errors: 2 } })).toBe(
			'1 file found · 2 errors'
		);
	});

	it('describes a finished thumbnail run, including a stop', () => {
		expect(
			describeDeviceEvent({
				type: 'thumbnails.finished',
				detail: { generated: 4, alreadyReady: 10, failed: 1, stopped: true, durationMs: 30_000 }
			})
		).toBe('Stopped early · 4 generated · 10 already had them · 1 failed · took 30s');
		expect(
			describeDeviceEvent({
				type: 'thumbnails.finished',
				detail: { generated: 0, alreadyReady: 0, failed: 0 }
			})
		).toBe('0 generated');
	});

	it('describes renames, new libraries and removals', () => {
		expect(
			describeDeviceEvent({ type: 'device.renamed', detail: { from: 'Old', to: 'New' } })
		).toBe('Old → New');
		expect(
			describeDeviceEvent({
				type: 'library.added',
				detail: { kind: 'series', rootPath: '/srv/Series' }
			})
		).toBe('Series · /srv/Series');
		expect(describeDeviceEvent({ type: 'library.removed', detail: { files: 1 } })).toBe(
			'1 file left the catalog'
		);
	});

	it('marks the first scan of a new library and stays quiet otherwise', () => {
		expect(describeDeviceEvent({ type: 'scan.started', detail: { reason: 'library-added' } })).toBe(
			'First scan of a new library'
		);
		expect(describeDeviceEvent({ type: 'scan.started', detail: { reason: 'rescan' } })).toBe(null);
		expect(describeDeviceEvent({ type: 'device.paired', detail: {} })).toBe(null);
	});

	it('ignores malformed detail values', () => {
		expect(
			describeDeviceEvent({ type: 'scan.finished', detail: { files: 'many', durationMs: null } })
		).toBe(null);
		expect(describeDeviceEvent({ type: 'device.renamed', detail: { from: 'x' } })).toBe(null);
	});
});
