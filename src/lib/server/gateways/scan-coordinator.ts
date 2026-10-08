/**
 * Who scans what, when. Pure bookkeeping (no DB, no sockets) so the rules are
 * testable; `scan.ts` wires the singleton to the registry.
 *
 * - One scan per device at a time (the walk and ffprobe share its disk);
 *   requests for its other libraries wait in a per-device queue.
 * - A request for a library that is already scanning becomes one rerun after
 *   it finishes (a watch event mid-scan may describe a file the walk passed).
 * - Repeated requests coalesce; `force` and an admin actor win when merged.
 * - The scan state is set only once the device accepted `scan.start`, and is
 *   dropped (not finalized) when the device disconnects.
 */

export type ScanReason =
	'library-added' | 'rescan' | 'full-rescan' | 'scheduled' | 'reconnect' | 'watch';

export interface ScanTarget {
	id: string;
	gatewayId: string;
	rootPath: string;
	kind: 'movie' | 'series';
}

export interface ScanRequest {
	target: ScanTarget;
	reason: ScanReason;
	/** Re-probe every file (ignore the device's probe cache). */
	force: boolean;
	/** null = automatic. */
	actorUserId: string | null;
}

export interface ActiveScan {
	request: ScanRequest;
	startedAt: Date;
	/** Files whose report differed from the last scan's (re-ingested). */
	changed: number;
	rerun: ScanRequest | null;
}

export type ScanRequestOutcome = 'started' | 'queued' | 'offline';

export interface ScanCoordinatorDeps {
	isOnline(gatewayId: string): boolean;
	/** Sends `scan.start`; throws when the device can't be reached. */
	start(request: ScanRequest): void;
	/** Called once a scan was accepted (for the activity log). */
	onStarted?(request: ScanRequest): void;
	now?(): Date;
}

function merge(a: ScanRequest, b: ScanRequest): ScanRequest {
	// An admin's request (it shows up in the activity log with their name) wins.
	const base = b.actorUserId || !a.actorUserId ? b : a;
	const force = a.force || b.force;
	return { ...base, force, reason: force ? 'full-rescan' : base.reason };
}

export class ScanCoordinator {
	readonly #deps: ScanCoordinatorDeps;
	readonly #active = new Map<string, ActiveScan>();
	/** gatewayId → libraryId → request, in arrival order. */
	readonly #queued = new Map<string, Map<string, ScanRequest>>();

	constructor(deps: ScanCoordinatorDeps) {
		this.#deps = deps;
	}

	request(request: ScanRequest): ScanRequestOutcome {
		const { id, gatewayId } = request.target;
		if (!this.#deps.isOnline(gatewayId)) return 'offline';
		const active = this.#active.get(id);
		if (active) {
			active.rerun = active.rerun ? merge(active.rerun, request) : request;
			return 'queued';
		}
		if (this.#gatewayBusy(gatewayId)) {
			const queue = this.#queued.get(gatewayId) ?? new Map<string, ScanRequest>();
			const prev = queue.get(id);
			queue.set(id, prev ? merge(prev, request) : request);
			this.#queued.set(gatewayId, queue);
			return 'queued';
		}
		return this.#launch(request) ? 'started' : 'offline';
	}

	/**
	 * The device reported `scan.done`: forget the scan and start whatever
	 * waited for it (this library's rerun first, then the device's queue).
	 */
	finish(libraryId: string): ActiveScan | undefined {
		const scan = this.#active.get(libraryId);
		if (!scan) return undefined;
		this.#active.delete(libraryId);
		const { gatewayId } = scan.request.target;
		if (scan.rerun) this.#enqueueFirst(gatewayId, scan.rerun);
		this.#startNext(gatewayId);
		return scan;
	}

	/** The device disconnected: its scans won't finish (it aborts them) and its queue is moot. */
	abandon(gatewayId: string): void {
		for (const [libraryId, scan] of this.#active) {
			if (scan.request.target.gatewayId === gatewayId) this.#active.delete(libraryId);
		}
		this.#queued.delete(gatewayId);
	}

	/** A library was removed: drop its pending requests (a running scan just finishes). */
	forget(libraryId: string): void {
		const scan = this.#active.get(libraryId);
		if (scan) scan.rerun = null;
		for (const queue of this.#queued.values()) queue.delete(libraryId);
	}

	noteChanged(libraryId: string, files: number): void {
		const scan = this.#active.get(libraryId);
		if (scan) scan.changed += files;
	}

	state(libraryId: string): 'scanning' | 'queued' | null {
		if (this.#active.has(libraryId)) return 'scanning';
		for (const queue of this.#queued.values()) if (queue.has(libraryId)) return 'queued';
		return null;
	}

	hasActive(): boolean {
		return this.#active.size > 0;
	}

	#gatewayBusy(gatewayId: string): boolean {
		for (const scan of this.#active.values()) {
			if (scan.request.target.gatewayId === gatewayId) return true;
		}
		return false;
	}

	#launch(request: ScanRequest): boolean {
		try {
			this.#deps.start(request);
		} catch {
			return false;
		}
		this.#active.set(request.target.id, {
			request,
			startedAt: this.#deps.now?.() ?? new Date(),
			changed: 0,
			rerun: null
		});
		this.#deps.onStarted?.(request);
		return true;
	}

	#enqueueFirst(gatewayId: string, request: ScanRequest): void {
		const queue = this.#queued.get(gatewayId) ?? new Map<string, ScanRequest>();
		const prev = queue.get(request.target.id);
		queue.delete(request.target.id);
		this.#queued.set(
			gatewayId,
			new Map([[request.target.id, prev ? merge(prev, request) : request], ...queue])
		);
	}

	#startNext(gatewayId: string): void {
		const queue = this.#queued.get(gatewayId);
		if (!queue) return;
		for (const [libraryId, request] of queue) {
			queue.delete(libraryId);
			if (this.#launch(request)) break;
			// The device went away: the rest of its queue can't start either.
			queue.clear();
		}
		if (queue.size === 0) this.#queued.delete(gatewayId);
	}
}
