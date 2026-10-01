import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

/** WebSocket endpoints (path prefix → handler module), mirrored by server/index.js. */
const WS_ENDPOINTS: [prefix: string, module: string][] = [
	['/gateway/ws', '/src/lib/server/gateways/ws.ts'],
	['/ws/together', '/src/lib/server/together/ws.ts']
];

/**
 * Attach the Finderella WebSocket endpoints (storage gateways, watch parties)
 * to the Vite dev server. Production uses server/index.js + the `init` hook
 * bridge instead; this plugin loads the same handler modules through Vite's SSR
 * pipeline so their singletons (gateway registry, party rooms) are shared with
 * the running app (and stay HMR-friendly). Other upgrades (Vite's HMR socket)
 * are left alone.
 */
function websocketsDev(): Plugin {
	return {
		name: 'finderella-ws-dev',
		configureServer(server: ViteDevServer) {
			server.httpServer?.on('upgrade', async (req, socket, head) => {
				const endpoint = WS_ENDPOINTS.find(([prefix]) => req.url?.startsWith(prefix));
				if (!endpoint) return;
				try {
					const mod = await server.ssrLoadModule(endpoint[1]);
					(
						mod as { handleUpgrade: (r: typeof req, s: typeof socket, h: Buffer) => void }
					).handleUpgrade(req, socket, head);
				} catch (err) {
					console.error(`[ws] failed to handle upgrade for ${endpoint[0]}`, err);
					socket.destroy();
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		websocketsDev(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// VPS deployment: Node server (see server/index.js, which also owns the
			// /gateway/ws and /ws/together WebSocket upgrades).
			adapter: adapter(),

			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts');
				}
			}
		})
	],
	ssr: {
		// Ships raw .svelte files; must be bundled for SSR, never require()d by Node directly.
		// @finderella/protocol ships source TypeScript, so it must be bundled too.
		noExternal: ['@hugeicons/svelte', '@finderella/protocol']
	}
});
