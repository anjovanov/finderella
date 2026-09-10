import { error, redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { isAdmin } from '$lib/auth-roles';
import { loginRequired } from '$lib/server/site-settings';
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
	// Pick up titles that were scanned before TMDB_API_KEY was configured.
	const { enrichPending } = await import('$lib/server/metadata');
	void enrichPending().catch(() => {});
	// Installs that predate roles: make sure someone can reach /admin.
	const { ensureAdminExists } = await import('$lib/server/users');
	await ensureAdminExists().catch(() => {});
};

// Paths reachable without a session. /api/auth/* is Better Auth's own surface;
// /api/gateway/pair authenticates by claim code; /api/stream/* (Phase 2) by
// playback-session capability id and is short-circuited before session lookup.
const PUBLIC_PREFIXES = ['/login', '/register', '/api/auth', '/api/gateway/pair'];

// Paths that need a session even when the admin has opened the hub to guests.
const ACCOUNT_PREFIXES = ['/settings', '/logout', '/admin'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
	return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isPublic(pathname: string): boolean {
	return matchesPrefix(pathname, PUBLIC_PREFIXES);
}

/** Everything under /admin (pages, their data requests and form actions) is admin-only. */
function isAdminArea(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
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
		// Site settings decide whether guests may browse; account pages never.
		const needsAccount =
			matchesPrefix(event.url.pathname, ACCOUNT_PREFIXES) || (await loginRequired());
		if (needsAccount) {
			// fetch() callers (player, progress) get a readable 401 body instead
			// of following a redirect into the login page's HTML.
			if (event.url.pathname.startsWith('/api/')) error(401, 'Sign in to continue.');
			redirect(303, '/login');
		}
	}

	// Non-admins never reach /admin form actions or API-style requests. Page
	// requests fall through to src/routes/admin/+layout.server.ts, whose 403
	// renders the app's own error page (an error thrown here would render
	// SvelteKit's bare fallback page instead).
	if (
		isAdminArea(event.url.pathname) &&
		!isAdmin(event.locals.user) &&
		event.request.method !== 'GET' &&
		event.request.method !== 'HEAD'
	) {
		error(403, 'This area is for administrators only.');
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
