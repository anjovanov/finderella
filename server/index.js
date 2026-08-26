/**
 * Finderella production server.
 *
 * Wraps the adapter-node handler in a plain Node http server so we can also
 * accept WebSocket upgrades from storage gateways (media agents) at /agent/ws. The actual WS
 * logic lives inside the SvelteKit bundle (src/lib/server/agents/ws.ts) and
 * is exposed on globalThis by the `init` hook in src/hooks.server.ts.
 *
 * Run after `npm run build`:  node --env-file=.env server/index.js
 */
import http from 'node:http';
import { handler } from '../build/handler.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = http.createServer(handler);

server.on('upgrade', (req, socket, head) => {
	if (req.url?.startsWith('/agent/ws')) {
		const upgrade = globalThis.__finderellaAgentUpgrade;
		if (typeof upgrade === 'function') {
			upgrade(req, socket, head);
		} else {
			// init hook hasn't finished yet — agent will retry with backoff.
			socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
			socket.destroy();
		}
		return;
	}
	// No other WebSocket endpoints exist.
	socket.destroy();
});

server.listen(port, host, () => {
	console.log(`finderella hub listening on http://${host}:${port}`);
});
