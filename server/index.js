/**
 * Finderella production server.
 *
 * Wraps the adapter-node handler in a plain Node http server so we can also
 * accept WebSocket upgrades: storage gateways (media agents) at /gateway/ws and
 * watch-party browsers at /ws/together. The actual WS logic lives inside the
 * SvelteKit bundle (src/lib/server/gateways/ws.ts, src/lib/server/together/ws.ts)
 * and is exposed on globalThis by the `init` hook in src/hooks.server.ts.
 *
 * Run after `npm run build`:  node --env-file=.env server/index.js
 */
import http from 'node:http';
import { handler } from '../build/handler.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = http.createServer(handler);

// WebSocket endpoints → the globalThis bridge the `init` hook installs for each.
const UPGRADES = [
	['/gateway/ws', '__finderellaGatewayUpgrade'], // storage gateways
	['/ws/together', '__finderellaTogetherUpgrade'] // watch parties (browsers)
];

server.on('upgrade', (req, socket, head) => {
	const route = UPGRADES.find(([prefix]) => req.url?.startsWith(prefix));
	if (!route) {
		socket.destroy();
		return;
	}
	const upgrade = globalThis[route[1]];
	if (typeof upgrade === 'function') {
		upgrade(req, socket, head);
	} else {
		// init hook hasn't finished yet — gateways and party clients retry with backoff.
		socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
		socket.destroy();
	}
});

server.listen(port, host, () => {
	console.log(`finderella hub listening on http://${host}:${port}`);
});
