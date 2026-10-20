/**
 * The `js` adapter's client catalogs (one per load id), as state: plain .ts
 * helpers (labels, formatters) read their runtime from here, so a template that
 * calls one re-renders when loadLocale switches the language, like the
 * components' own messages do. Client-only (the server uses
 * js.loader.server.js), so module-level state is safe here.
 *
 * @type {import('wuchale/runtime').Runtime[]}
 */
export const jsRuntimes = $state([]);
