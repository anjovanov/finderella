import type { ChildProcess } from 'node:child_process';

/** Long enough for any OS to reap a SIGKILLed ffmpeg; short enough not to stall a seek. */
export const KILL_WAIT_MS = 2_000;

/**
 * Kill a child and wait (bounded) until it has really exited. On Windows
 * `TerminateProcess` returns before the process is gone, and until then it
 * still holds its output files: deleting the folder fails with EBUSY, and a
 * restarted ffmpeg writing the same names races the dying one.
 */
export async function killAndWait(proc: ChildProcess, timeoutMs = KILL_WAIT_MS): Promise<void> {
	if (proc.pid === undefined || proc.exitCode !== null || proc.signalCode !== null) return;
	let timer: NodeJS.Timeout | undefined;
	const exited = new Promise<void>((resolve) => {
		proc.once('exit', () => resolve());
		timer = setTimeout(resolve, timeoutMs);
		timer.unref?.();
	});
	proc.kill('SIGKILL');
	await exited;
	clearTimeout(timer);
}
