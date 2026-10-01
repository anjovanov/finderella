import { afterNavigate, replaceState } from '$app/navigation';
import { page } from '$app/state';
import { partySearch, withParty, type TogetherMedia } from '$lib/data/together';
import { startParty, type StartPartyRequest } from '$lib/together-client';
import { TogetherSession } from './session.svelte';

const MESSAGE_MS = 6_000;

/**
 * A watch page's party lifecycle, shared by the movie and series watch pages.
 * Construct it during component init: it owns an `$effect` (the session's
 * connection) and an `afterNavigate` hook.
 *
 * The party code is component state seeded from `?party=` — not derived from
 * `page.url` — because joining from the player and leaving only rewrite the
 * address bar (shallow `replaceState`): a real navigation would re-run the
 * loads and restart the playback session.
 */
export class WatchParty {
	code: string | null = $state(null);
	session: TogetherSession | null = $state.raw(null);
	/** The page's first playback session waits for the party it was opened with. */
	awaiting = $state(false);
	inviteOpen = $state(false);
	/** Why the party ended for this viewer, shown briefly. */
	message: string | null = $state(null);

	#messageTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(onMediaChange: (media: TogetherMedia) => void) {
		const url = page.url;
		this.code = url.searchParams.get('party');
		this.awaiting = this.code !== null;
		this.inviteOpen = this.code !== null && url.searchParams.has('invite');

		$effect(() => {
			const code = this.code;
			if (!code) return;
			const session = new TogetherSession(code, {
				onJoined: () => (this.awaiting = false),
				onMediaChange,
				onEnded: (message) => this.leave(message)
			});
			this.session = session;
			session.connect();
			return () => {
				session.dispose();
				this.session = null;
			};
		});

		// `invite=1` (set by "Watch together" on a detail page) is one-shot.
		afterNavigate(() => {
			if (page.url.searchParams.has('invite')) this.#writeUrl();
		});
	}

	/** A same-party link: keeps `?party=` on in-party navigation (next episode, episode cards). */
	href = (path: string): string => (this.code ? withParty(path, this.code) : path);

	/** Turn this solo viewing into a party (the player's "Watch together"). */
	async start(request: StartPartyRequest): Promise<void> {
		const code = await startParty(request);
		this.code = code;
		this.inviteOpen = true;
		this.#writeUrl();
	}

	/** Leave (or lose) the party; playback carries on alone. */
	leave(message?: string): void {
		this.code = null;
		this.awaiting = false;
		this.inviteOpen = false;
		this.#writeUrl();
		clearTimeout(this.#messageTimer);
		this.message = message ?? null;
		if (message) this.#messageTimer = setTimeout(() => (this.message = null), MESSAGE_MS);
	}

	#writeUrl(): void {
		// Shallow: the address bar (reload / share fidelity), no navigation. The path
		// is this page's own, already resolved.
		/* eslint-disable-next-line svelte/no-navigation-without-resolve */
		replaceState(`${location.pathname}${partySearch(location.search, this.code)}`, page.state);
	}
}
