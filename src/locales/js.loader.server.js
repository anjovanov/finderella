import { loadCatalog, loadCount } from './.wuchale/js.proxy.sync.js';
import { serverRuntime } from './source-runtime.js';

export const key = 'js';
export { loadCatalog, loadCount }; // for loading before runWithLocale

// two exports, same function
export const getRuntime = serverRuntime(key, loadCount, loadCatalog);
export const getRuntimeRx = getRuntime;
