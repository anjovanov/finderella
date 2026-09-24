import type { ActionResult, SubmitFunction } from '@sveltejs/kit';

/**
 * State for a form action inside a `Dialog`/`AlertDialog`: `open` drives the dialog,
 * `submit` (for `use:enhance`) closes it on success and keeps it open with the `fail()`
 * message on failure — without calling `update()`, so a page-level `form.message` alert
 * doesn't repeat the error behind the dialog. `target` holds what the dialog acts on and
 * stays set through the close animation.
 */
export class DialogForm<T = null> {
	open = $state(false);
	busy = $state(false);
	error = $state<string | null>(null);
	target = $state<T | null>(null);

	#onSuccess?: (data: Record<string, unknown> | undefined) => void;

	constructor(opts: { onSuccess?: (data: Record<string, unknown> | undefined) => void } = {}) {
		this.#onSuccess = opts.onSuccess;
	}

	show(target: T | null = null) {
		this.target = target;
		this.error = null;
		this.busy = false;
		this.open = true;
	}

	close = () => {
		this.open = false;
	};

	submit: SubmitFunction = () => {
		this.busy = true;
		this.error = null;
		return async ({ result, update }) => {
			this.busy = false;
			if (result.type === 'success' || result.type === 'redirect') {
				this.open = false;
				if (result.type === 'success') this.#onSuccess?.(result.data);
				await update();
			} else {
				this.error = failureMessage(result);
			}
		};
	};
}

function failureMessage(result: ActionResult): string {
	if (result.type === 'failure') {
		const message = (result.data as { message?: unknown } | undefined)?.message;
		if (typeof message === 'string' && message) return message;
		return 'That didn’t work. Try again.';
	}
	return 'The server couldn’t complete that. Try again.';
}
