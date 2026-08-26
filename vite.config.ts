import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

/**
 * Attach the Finderella gateway WebSocket endpoint to the Vite dev server.
 * Production uses server/index.js + the `init` hook bridge instead; this
 * plugin loads the same handler module through Vite's SSR pipeline so the
 * registry singleton is shared with the running app (and stays HMR-friendly).
 */
function gatewayWsDev(): Plugin {
	return {
		name: 'finderella-gateway-ws-dev',
		configureServer(server: ViteDevServer) {
			server.httpServer?.on('upgrade', async (req, socket, head) => {
				if (!req.url?.startsWith('/gateway/ws')) return;
				try {
					const mod = await server.ssrLoadModule('/src/lib/server/gateways/ws.ts');
					(
						mod as { handleUpgrade: (r: typeof req, s: typeof socket, h: Buffer) => void }
					).handleUpgrade(req, socket, head);
				} catch (err) {
					console.error('[gateway-ws] failed to handle upgrade', err);
					socket.destroy();
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		gatewayWsDev(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// VPS deployment: Node server (see server/index.js, which also owns the
			// /gateway/ws WebSocket upgrade).
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
