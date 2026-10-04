import type { auth } from '$lib/server/auth';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: typeof auth.$Infer.Session.user;
			session?: typeof auth.$Infer.Session.session;
			/** The signed-in account's profiles (hooks.server.ts). */
			profiles?: import('$lib/data/profiles').ProfileSummary[];
			/** The profile this sign-in watches as; null until one is picked (and for guests). */
			profile?: import('$lib/data/profiles').ProfileSummary | null;
			/** Set by the root layout load; hooks.server.ts writes it into <html class>. */
			theme?: import('$lib/data/preferences').Theme;
		}

		// interface Error {}
		interface PageData {
			/** The hub's branding, from the root layout (absent only if that load failed). */
			branding?: import('$lib/data/branding').Branding;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
