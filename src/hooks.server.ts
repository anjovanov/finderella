import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

// Bridge the gateway WebSocket handler out of the SvelteKit bundle so the
// production server (server/index.js) can route /gateway/ws upgrades to it.
// In dev the Vite plugin in vite.config.ts loads the module directly.
export const init: ServerInit = async () => {
	if (building) return;
	const { handleUpgrade } = await import('$lib/server/gateways/ws');
	(globalThis as Record<string, unknown>).__finderellaGatewayUpgrade = handleUpgrade;
	// Playback-session rows left 'active' by a previous process are dead.
	const { sessionManager } = await import('$lib/server/streaming/session-manager');
	await sessionManager.reapOrphans().catch(() => {});
};

// Paths reachable without a session. /api/auth/* is Better Auth's own surface;
// /api/gateway/pair authenticates by claim code; /api/stream/* (Phase 2) by
// playback-session capability id and is short-circuited before session lookup.
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/gateway/pair'];

function isPublic(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	// Stream URLs authorize by playback-session uuid (checked in the route
	// against the in-memory SessionManager). Skip the per-request Better Auth
	// DB lookup here — video elements fetch ranges/segments every few seconds.
	if (event.url.pathname.startsWith('/api/stream/')) {
		return resolve(event);
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	if (!event.locals.user && !isPublic(event.url.pathname)) {
		redirect(303, '/login');
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
