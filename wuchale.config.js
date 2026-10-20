// @ts-check
import {
	adapter as svelte,
	defaultArgs as svelteDefaults,
	svelteKitDefaultHeuristic
} from '@wuchale/svelte';
import { adapter as js, pluralPattern } from 'wuchale/adapter-vanilla';
import { defineConfig } from 'wuchale';

/**
 * `currentLocale()` (src/lib/data/locale.ts) gets the caller's catalog locale
 * appended as its argument, so formatters can use the viewer's language.
 */
const currentLocalePattern = { name: 'currentLocale', args: ['locale'] };
const patterns = [pluralPattern, currentLocalePattern];

/**
 * Server code is opt-in: only literals marked `/* @wc-include *\/` are
 * translated. Its capitalised strings are mostly not UI text (header names,
 * log lines, protocol values, object keys), and a request-less caller (jobs,
 * WebSocket handlers) gets English anyway. null = the adapter's default.
 *
 * @type {import('wuchale').HeuristicFunc}
 */
const serverOptIn = (_txt, file) =>
	/(^|\/)src\/lib\/server\/|\+server\.ts$/.test(file) ? false : null;

/**
 * The Svelte adapter's runtime rules, except in `.svelte.{js,ts}` modules:
 * upstream checks only `.svelte.js` and doesn't count class methods as
 * functions, so code in a `.svelte.ts` method got a `$derived` runtime read in
 * place. That works, but Svelte warns `state_referenced_locally` for each one.
 * There, a function body gets the plain runtime (still reactive: it reads the
 * catalog `$state`), and only top-level code a `$derived` one.
 *
 * @type {import('wuchale').RuntimeConf<import('@wuchale/svelte').RuntimeCtxSv>}
 */
const svelteRuntime = {
	...svelteDefaults.runtime,
	initReactive: (path, file, ctx) =>
		isSvelteModule(file, ctx.module)
			? !inFunction(path)
			: svelteDefaults.runtime.initReactive(path, file, ctx),
	useReactive: (path, file, ctx) =>
		isSvelteModule(file, ctx.module)
			? !inFunction(path)
			: svelteDefaults.runtime.useReactive(path, file, ctx)
};

/** @param {string} file @param {boolean} module `<script module>` */
function isSvelteModule(file, module) {
	return module || /\.svelte\.(js|ts)$/.test(file);
}

/** @param {import('wuchale').Scope[]} path */
function inFunction(path) {
	return path.some((s) => s.type === 'function' || s.type === 'funcexpr' || s.type === 'method');
}

export default defineConfig({
	locales: ['en', 'es'],
	adapters: {
		// loader 'custom' on both: src/locales/*.loader*.js are ours (English fallback on
		// the server, reactive js catalogs). Any built-in loader rewrites them from
		// wuchale's templates every time a dev server or the CLI starts.
		main: svelte({
			loader: 'custom',
			heuristic: svelteKitDefaultHeuristic,
			patterns,
			runtime: svelteRuntime
		}),
		// Plain modules: only strings inside functions are extracted (the vanilla
		// default), so nothing is evaluated once at import in the wrong language.
		js: js({
			loader: 'custom',
			patterns,
			heuristic: serverOptIn,
			files: {
				include: [
					'src/**/+{page,layout}.{js,ts}',
					'src/**/+{page,layout}.server.{js,ts}',
					// Client-safe helpers (labels, formatters).
					'src/lib/*.ts',
					'src/lib/{data,remux,together,components,hooks}/**/*.ts',
					// Server modules and endpoints with user-facing text (opt-in, above).
					'src/lib/server/profiles.ts',
					'src/lib/server/stats/*.ts',
					'src/lib/server/streaming/{audio,subtitles}.ts',
					'src/lib/server/together/*.ts',
					'src/routes/**/+server.ts'
				],
				ignore: ['**/*.d.ts', '**/*.test.ts', '**/*.svelte.ts', 'src/lib/components/ui/**']
			}
		})
	}
});
