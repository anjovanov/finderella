/** Positions inside these bounds count as "in progress" for resume/rows. */
export const MIN_RESUME_SECONDS = 30;
export const FINISHED_FRACTION = 0.95;

export function inProgress(position: number, duration: number): boolean {
	return position >= MIN_RESUME_SECONDS && duration > 0 && position < duration * FINISHED_FRACTION;
}

/**
 * 0–1 fraction to draw under a card, or undefined when there's nothing worth
 * showing (a few seconds in). Finished titles show a full bar.
 */
export function progressFraction(position: number, duration: number): number | undefined {
	if (!(duration > 0)) return undefined;
	const fraction = Math.min(1, position / duration);
	if (fraction >= FINISHED_FRACTION) return 1;
	if (position < MIN_RESUME_SECONDS) return undefined;
	return fraction;
}
