/**
 * Leave fullscreen if the document is in it. The watch player fullscreens the
 * whole document (so it survives the player's remount between sessions); the
 * watch pages call this when the viewer leaves the route.
 */
export function exitFullscreen(): void {
	if (typeof document === 'undefined' || !document.fullscreenElement) return;
	document.exitFullscreen().catch(() => {});
}
