/**
 * Stop the document from scrolling; returns the undo. The watch pages hold it
 * for their whole lifetime: the page under the fixed player/status overlay is
 * taller than the viewport (header + min-h-svh main), and the player unmounts
 * between sessions (quality/audio change, next episode), so a lock owned by
 * the player would flash a scrollbar during "Preparing playback…".
 */
export function lockPageScroll(): () => void {
	const root = document.documentElement;
	const previous = root.style.overflow;
	root.style.overflow = 'hidden';
	return () => {
		root.style.overflow = previous;
	};
}
