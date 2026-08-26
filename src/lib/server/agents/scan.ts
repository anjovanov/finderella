import { markScanStarted } from '$lib/server/catalog/ingest';
import { log } from '$lib/server/log';
import { registry } from './registry';

export interface ScannableLibrary {
	id: string;
	agentId: string;
	rootPath: string;
	kind: 'movie' | 'series';
}

/** Ask an agent to (re)scan a library. Throws if the agent is offline. */
export function triggerScan(lib: ScannableLibrary): void {
	markScanStarted(lib.id);
	registry.send(lib.agentId, {
		type: 'scan.start',
		libraryId: lib.id,
		rootPath: lib.rootPath,
		kind: lib.kind
	});
	log.info({ libraryId: lib.id, agentId: lib.agentId, rootPath: lib.rootPath }, 'scan requested');
}
