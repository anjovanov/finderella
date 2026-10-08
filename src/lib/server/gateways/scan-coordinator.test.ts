import { describe, expect, it } from 'vitest';
import { ScanCoordinator, type ScanReason, type ScanRequest } from './scan-coordinator';

function lib(id: string, gatewayId = 'gw1') {
	return { id, gatewayId, rootPath: `/media/${id}`, kind: 'movie' as const };
}

function req(id: string, opts: Partial<ScanRequest> & { gatewayId?: string } = {}): ScanRequest {
	return {
		target: lib(id, opts.gatewayId),
		reason: (opts.reason ?? 'scheduled') as ScanReason,
		force: opts.force ?? false,
		actorUserId: opts.actorUserId ?? null
	};
}

function setup(online = new Set(['gw1', 'gw2'])) {
	const started: ScanRequest[] = [];
	const coordinator = new ScanCoordinator({
		isOnline: (id) => online.has(id),
		start: (r) => {
			if (!online.has(r.target.gatewayId)) throw new Error('offline');
			started.push(r);
		}
	});
	return { coordinator, started, online };
}

describe('ScanCoordinator', () => {
	it('starts a scan on an idle device and refuses offline ones', () => {
		const { coordinator, started } = setup();
		expect(coordinator.request(req('a'))).toBe('started');
		expect(coordinator.request(req('z', { gatewayId: 'gw9' }))).toBe('offline');
		expect(started.map((r) => r.target.id)).toEqual(['a']);
		expect(coordinator.state('a')).toBe('scanning');
		expect(coordinator.state('z')).toBeNull();
	});

	it('runs one scan per device, queueing the rest in order', () => {
		const { coordinator, started } = setup();
		coordinator.request(req('a'));
		expect(coordinator.request(req('b'))).toBe('queued');
		expect(coordinator.request(req('c'))).toBe('queued');
		// Another device is independent.
		expect(coordinator.request(req('x', { gatewayId: 'gw2' }))).toBe('started');
		expect(coordinator.state('b')).toBe('queued');

		coordinator.finish('a');
		expect(started.map((r) => r.target.id)).toEqual(['a', 'x', 'b']);
		coordinator.finish('b');
		expect(started.map((r) => r.target.id)).toEqual(['a', 'x', 'b', 'c']);
	});

	it('turns a request for a scanning library into one rerun after it', () => {
		const { coordinator, started } = setup();
		coordinator.request(req('a'));
		coordinator.request(req('b'));
		expect(coordinator.request(req('a', { reason: 'watch' }))).toBe('queued');
		expect(coordinator.request(req('a', { reason: 'watch' }))).toBe('queued');

		coordinator.finish('a');
		// The rerun goes before the device's other queued library.
		expect(started.map((r) => r.target.id)).toEqual(['a', 'a']);
		expect(started[1].reason).toBe('watch');
		coordinator.finish('a');
		expect(started.map((r) => r.target.id)).toEqual(['a', 'a', 'b']);
	});

	it('merges coalesced requests: force and an admin actor win', () => {
		const { coordinator, started } = setup();
		coordinator.request(req('a'));
		coordinator.request(req('b', { reason: 'rescan', actorUserId: 'admin' }));
		coordinator.request(req('b', { reason: 'watch' }));
		coordinator.request(req('b', { reason: 'scheduled', force: true }));

		coordinator.finish('a');
		expect(started[1]).toMatchObject({
			reason: 'full-rescan',
			force: true,
			actorUserId: 'admin'
		});
	});

	it('counts changed files on the active scan and hands them back on finish', () => {
		const { coordinator } = setup();
		coordinator.request(req('a'));
		coordinator.noteChanged('a', 3);
		coordinator.noteChanged('a', 2);
		coordinator.noteChanged('nope', 9);
		const scan = coordinator.finish('a');
		expect(scan?.changed).toBe(5);
		expect(coordinator.finish('a')).toBeUndefined();
		expect(coordinator.hasActive()).toBe(false);
	});

	it('drops a disconnected device’s scans and queue without finishing them', () => {
		const { coordinator, started } = setup();
		coordinator.request(req('a'));
		coordinator.request(req('b'));
		coordinator.request(req('x', { gatewayId: 'gw2' }));
		coordinator.abandon('gw1');
		expect(coordinator.state('a')).toBeNull();
		expect(coordinator.state('b')).toBeNull();
		expect(coordinator.state('x')).toBe('scanning');
		// A late scan.done from the old connection finds nothing.
		expect(coordinator.finish('a')).toBeUndefined();
		expect(started.map((r) => r.target.id)).toEqual(['a', 'x']);
	});

	it('clears a device’s queue when it went away between scans', () => {
		const { coordinator, started, online } = setup();
		coordinator.request(req('a'));
		coordinator.request(req('b'));
		online.delete('gw1');
		coordinator.finish('a');
		expect(started.map((r) => r.target.id)).toEqual(['a']);
		expect(coordinator.state('b')).toBeNull();
	});

	it('forgets a removed library’s pending requests', () => {
		const { coordinator, started } = setup();
		coordinator.request(req('a'));
		coordinator.request(req('a'));
		coordinator.request(req('b'));
		coordinator.forget('a');
		coordinator.forget('b');
		coordinator.finish('a');
		expect(started.map((r) => r.target.id)).toEqual(['a']);
	});
});
