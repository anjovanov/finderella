import { defaultCollection, registerLoaders } from 'wuchale/load-utils';
import { loadCatalog, loadCount } from './.wuchale/js.proxy.js';
import { jsRuntimes } from './js-runtimes.svelte.js';

const key = 'js';

// two exports. can be used anywhere
export const getRuntime = registerLoaders(
	key,
	loadCatalog,
	loadCount,
	defaultCollection(jsRuntimes)
);
export const getRuntimeRx = getRuntime;
