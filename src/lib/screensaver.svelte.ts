/**
 * Screensaver state, provided by the root layout through context (one
 * controller per app instance — never module state, which the server would
 * share between requests). The screensaver component renders it; anything
 * that plays video holds an inhibitor so a paused film or a trailer is never
 * covered; the settings page previews it.
 */

import { createContext, untrack } from 'svelte';
import type { ScreensaverKind } from '$lib/data/preferences';

export class ScreensaverController {
	/** What is showing; null = hidden. */
	active = $state<ScreensaverKind | null>(null);
	#inhibitors = $state(0);
	/** performance.now() at the last show — input right after it doesn't dismiss. */
	activatedAt = 0;
	#restoreFocus: HTMLElement | null = null;

	get inhibited(): boolean {
		return this.#inhibitors > 0;
	}

	/** Show it now (the idle timer, or a preview — which ignores the enabled switch). */
	show(kind: ScreensaverKind): void {
		if (this.active || this.inhibited) return;
		this.#restoreFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		this.activatedAt = performance.now();
		this.active = kind;
	}

	dismiss(): void {
		if (!this.active) return;
		this.active = null;
		this.#restoreFocus?.focus({ preventScroll: true });
		this.#restoreFocus = null;
	}

	/**
	 * Keep the screensaver off (and take it down if it's up) until the returned
	 * release function runs — use it as an $effect cleanup. The counter update
	 * is untracked: `++` reads the state, and a calling effect subscribed to it
	 * would re-run on its own write until Svelte throws effect_update_depth_exceeded.
	 */
	inhibit(): () => void {
		untrack(() => {
			this.#inhibitors++;
			this.dismiss();
		});
		let released = false;
		return () => {
			if (released) return;
			released = true;
			untrack(() => this.#inhibitors--);
		};
	}
}

export const [getScreensaver, setScreensaver] = createContext<ScreensaverController>();
