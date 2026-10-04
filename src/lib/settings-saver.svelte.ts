import { applyAction, deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';

type SettingValue = string | number | boolean;

/**
 * Saves settings the moment a control changes (no Save button): posts just
 * the changed fields to a form action that accepts a partial patch, the way
 * SvelteKit's docs call an action with `fetch` + `deserialize`. Saves run one
 * at a time, in order, so a quick second change can't land before the first.
 *
 * The controls stay inside their `<form>` (with a `<noscript>` Save button)
 * so the page still works without JavaScript.
 */
export class SettingsSaver {
	status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	error = $state<string | null>(null);

	#action: string;
	#invalidate: boolean;
	#queue: Promise<void> = Promise.resolve();
	#pending = 0;
	#savedTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * @param action The form action, e.g. `?/updateSubtitles`.
	 * @param opts.invalidate Re-run the loads once the saves settle — only for
	 *   settings something outside the form reads (the root layout's theme and
	 *   screensaver). Otherwise the controls' own state already shows the
	 *   saved values, and a reload racing a newer change would flick it back.
	 */
	constructor(action: string, opts: { invalidate?: boolean } = {}) {
		this.#action = action;
		this.#invalidate = opts.invalidate ?? false;
	}

	save = (patch: Record<string, SettingValue>): Promise<void> => {
		this.#pending++;
		clearTimeout(this.#savedTimer);
		this.status = 'saving';
		this.error = null;
		this.#queue = this.#queue.then(() => this.#post(patch));
		return this.#queue;
	};

	async #post(patch: Record<string, SettingValue>): Promise<void> {
		const body = new FormData();
		for (const [name, value] of Object.entries(patch)) body.set(name, String(value));
		let failure: string | null = null;
		try {
			const response = await fetch(this.#action, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type === 'failure') {
				const message = (result.data as { message?: unknown } | undefined)?.message;
				failure = typeof message === 'string' && message ? message : 'That didn’t save.';
			} else if (result.type === 'error') {
				failure = 'The server couldn’t save that. Try again.';
			} else if (result.type === 'redirect') {
				// e.g. signed out meanwhile: follow it like a form submission would.
				await applyAction(result);
			}
		} catch {
			failure = 'Couldn’t reach the server. Try again.';
		}
		this.#pending--;

		if (failure) {
			this.status = 'error';
			this.error = failure;
			// Put the controls back on what is actually saved.
			await invalidateAll();
			return;
		}
		if (this.#pending > 0) return;
		if (this.#invalidate) await invalidateAll();
		if (this.status === 'saving') {
			this.status = 'saved';
			this.#savedTimer = setTimeout(() => {
				if (this.status === 'saved') this.status = 'idle';
			}, 3000);
		}
	}
}
