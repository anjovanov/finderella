import toRuntime from 'wuchale/runtime';
import { runtimeCtx } from 'wuchale/load-utils/server';

/**
 * Server-side `getRuntime` for one adapter. Inside a request, hooks.server.ts's
 * runWithLocale provides the viewer's catalog. Outside one (background jobs,
 * WebSocket handlers, `init`, tests) wuchale's own `currentRuntime` returns an
 * empty runtime that renders every message as '', so fall back to the source
 * (English) text the code was written in.
 *
 * @param {string} key
 * @param {number} loadCount
 * @param {(loadID: number, locale: string) => import('wuchale/runtime').CatalogModule} loadCatalog
 */
export function serverRuntime(key, loadCount, loadCatalog) {
	const source = Array.from({ length: loadCount }, (_, id) =>
		toRuntime(loadCatalog(id, 'en'), 'en')
	);
	return (loadID = 0) => runtimeCtx.getStore()?.[key]?.[loadID] ?? source[loadID];
}
