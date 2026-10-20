import { loadCatalog, loadCount } from './.wuchale/main.proxy.sync.js';
import { serverRuntime } from './source-runtime.js';

const key = 'main';

export { key, loadCatalog, loadCount }; // for hooks.server.{js,ts}

// for non-reactive
export const getRuntime = serverRuntime(key, loadCount, loadCatalog);

// same function, only will be inside $derived when used
export const getRuntimeRx = getRuntime;
