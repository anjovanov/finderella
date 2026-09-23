/**
 * Autoplay-next for the watch pages: signed-in viewers keep it on their
 * account (/settings/playback, or the player's switch); guests keep it in
 * this browser under the key the player has always used.
 */

const AUTOPLAY_KEY = 'finderella:autoplay-next';

/** This browser's choice (guests); on unless it was switched off here. */
export function loadGuestAutoplay(): boolean {
	try {
		return localStorage.getItem(AUTOPLAY_KEY) !== '0';
	} catch {
		return true;
	}
}

function storeGuestAutoplay(on: boolean): void {
	try {
		localStorage.setItem(AUTOPLAY_KEY, on ? '1' : '0');
	} catch {
		// localStorage unavailable — the choice just isn't remembered.
	}
}

/** Persist a switch flip from the player: to the account when signed in, else to this browser. */
export function saveAutoplayNext(on: boolean, signedIn: boolean): void {
	if (!signedIn) {
		storeGuestAutoplay(on);
		return;
	}
	void fetch('/api/settings/playback', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ autoplayNext: on })
	}).catch(() => {
		// Offline — the switch still applies for this session.
	});
}
