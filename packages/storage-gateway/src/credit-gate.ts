/**
 * Credit-based flow control shared by every outbound byte transfer: the hub
 * grants an initial window and tops it up as the browser drains; senders
 * block on `wait()` when the window is empty. `abort()` releases waiters.
 */
export class CreditGate {
	#credit: number;
	#waiter: (() => void) | null = null;
	aborted = false;

	constructor(initialBytes: number) {
		this.#credit = initialBytes;
	}

	get credit(): number {
		return this.#credit;
	}

	add(bytes: number): void {
		this.#credit += bytes;
		this.#waiter?.();
	}

	consume(bytes: number): void {
		this.#credit -= bytes;
	}

	abort(): void {
		this.aborted = true;
		this.#waiter?.();
	}

	async wait(): Promise<void> {
		while (this.#credit <= 0 && !this.aborted) {
			await new Promise<void>((resolveWait) => {
				this.#waiter = resolveWait;
			});
			this.#waiter = null;
		}
	}
}
