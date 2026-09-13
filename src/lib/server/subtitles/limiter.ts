/**
 * Minimum spacing between calls to one provider (OpenSubtitles allows 5/s per
 * IP; Subdl is undocumented). One queue per provider, shared by the player
 * searches and the bulk job.
 */
export class RateLimiter {
	#last = 0;
	#chain: Promise<void> = Promise.resolve();

	constructor(private readonly minIntervalMs: number) {}

	/** Resolves when the caller may fire the next request. */
	wait(): Promise<void> {
		const turn = this.#chain.then(async () => {
			const wait = this.#last + this.minIntervalMs - Date.now();
			if (wait > 0) await new Promise((resolveWait) => setTimeout(resolveWait, wait));
			this.#last = Date.now();
		});
		this.#chain = turn.catch(() => {});
		return turn;
	}
}

export const sleep = (ms: number) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
