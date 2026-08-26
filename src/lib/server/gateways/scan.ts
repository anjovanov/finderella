import { markScanStarted } from '$lib/server/catalog/ingest';
import { log } from '$lib/server/log';
import { registry } from './registry';

export interface ScannableLibrary {
	id: string;
	gatewayId: string;
	rootPath: string;
	kind: 'movie' | 'series';
}

/** Ask an gateway to (re)scan a library. Throws if the gateway is offline. */
export function triggerScan(lib: ScannableLibrary): void {
	markScanStarted(lib.id);
	registry.send(lib.gatewayId, {
		type: 'scan.start',
		libraryId: lib.id,
		rootPath: lib.rootPath,
		kind: lib.kind
	});
	log.info(
		{ libraryId: lib.id, gatewayId: lib.gatewayId, rootPath: lib.rootPath },
		'scan requested'
	);
}
