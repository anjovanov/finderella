import { formatDurationUnits } from '$lib/data/time';
import type { TogetherChatEntry, TogetherEnd } from '$lib/data/together';

/**
 * Watch-party text in the viewer's UI language. The hub sends structured
 * events and end reasons (it runs outside any request, and one room can mix
 * languages); these word them where they are shown.
 */

/** "Ana paused" for a feed event. */
export function chatEventText(entry: Extract<TogetherChatEntry, { kind: 'event' }>): string {
	const name = entry.name ?? 'Someone';
	const event = entry.event;
	switch (event.type) {
		case 'joined':
			return `${name} joined`;
		case 'left':
			return `${name} left`;
		case 'played':
			return `${name} pressed play`;
		case 'paused':
			return `${name} paused`;
		case 'seeked':
			return `${name} jumped to ${formatDurationUnits(event.position)}`;
		case 'media':
			return event.label ? `${name} started ${event.label}` : `${name} changed the episode`;
		case 'removed':
			return `${event.target} was removed`;
		case 'host':
			return `${name} is now the host`;
	}
}

/** Why the party ended for this viewer. */
export function endedText(end: TogetherEnd): string {
	switch (end.reason) {
		case 'ended':
			return end.by ? `${end.by} ended the watch party.` : 'This watch party has ended.';
		case 'kicked':
			return end.by
				? `${end.by} removed you from the watch party.`
				: 'You were removed from this watch party.';
		case 'full':
			return 'This watch party is full.';
		case 'replaced':
			return 'Opened in another window.';
		case 'gone':
			return 'This watch party has ended.';
	}
}

export function slowDownText(): string {
	return 'Slow down a little.';
}
