import { describe, expect, it } from 'vitest';
import {
	activeMarker,
	creditsCountdown,
	enteredByPlayback,
	isSkipMode,
	skipButtonVisible,
	skipTarget,
	type PlaybackMarkers
} from './markers';

const markers: PlaybackMarkers = {
	intro: { start: 60, end: 120, autoSkip: true },
	credits: { start: 1300, end: 1345, autoSkip: true, toEnd: true }
};

describe('activeMarker', () => {
	it('finds the marker under the playhead', () => {
		expect(activeMarker(59.9, markers)).toBeNull();
		expect(activeMarker(60, markers)?.kind).toBe('intro');
		expect(activeMarker(118.9, markers)?.kind).toBe('intro');
		// The last second of the intro isn't worth a button.
		expect(activeMarker(119.5, markers)).toBeNull();
		expect(activeMarker(1300, markers)?.kind).toBe('credits');
		expect(activeMarker(1344.9, markers)?.kind).toBe('credits');
		expect(activeMarker(1345, markers)).toBeNull();
	});

	it('handles missing markers', () => {
		expect(activeMarker(70, null)).toBeNull();
		expect(activeMarker(70, { intro: null, credits: null })).toBeNull();
		expect(activeMarker(Number.NaN, markers)).toBeNull();
	});
});

describe('enteredByPlayback', () => {
	const span = markers.intro!;

	it('is true when playback crosses the start', () => {
		expect(enteredByPlayback(59.8, 60.05, span)).toBe(true);
	});

	it('is false for seeks into the marker or back into it', () => {
		expect(enteredByPlayback(30, 70, span)).toBe(false);
		expect(enteredByPlayback(130, 70, span)).toBe(false);
		expect(enteredByPlayback(70, 70.25, span)).toBe(false);
	});

	it('counts a session that starts at the marker, not one resumed in the middle', () => {
		expect(enteredByPlayback(null, 60, span)).toBe(true);
		expect(enteredByPlayback(null, 61.5, span)).toBe(true);
		expect(enteredByPlayback(null, 90, span)).toBe(false);
		expect(enteredByPlayback(null, 10, span)).toBe(false);
	});
});

describe('skipTarget', () => {
	it('jumps to the end of the marker', () => {
		expect(skipTarget(markers.intro!, 1345)).toBe(120);
		expect(skipTarget({ ...markers.credits!, toEnd: false, end: 1330 }, 1345)).toBe(1330);
	});

	it('lands just before the end for closing credits', () => {
		expect(skipTarget(markers.credits!, 1345.2)).toBeCloseTo(1344.7);
		expect(skipTarget(markers.credits!, Number.NaN)).toBe(1345);
	});
});

describe('creditsCountdown', () => {
	const credits = markers.credits!;

	it('counts down from where the viewer reached the credits', () => {
		expect(creditsCountdown(1299, credits, 1299)).toBeNull();
		expect(creditsCountdown(1300, credits, 1300)).toBe(10);
		expect(creditsCountdown(1304, credits, 1300)).toBe(6);
		expect(creditsCountdown(1320, credits, 1300)).toBe(0);
		// A seek into the middle of the credits gets the full countdown.
		expect(creditsCountdown(1330, credits, 1330)).toBe(10);
		expect(creditsCountdown(1333, credits, 1330)).toBe(7);
	});

	it('never outlasts short credits', () => {
		expect(creditsCountdown(1340, { ...credits, start: 1338 }, 1338)).toBe(5);
	});
});

describe('skipButtonVisible', () => {
	it('shows for a grace period, then only with the controls', () => {
		const span = markers.intro!;
		expect(skipButtonVisible(61, span, false)).toBe(true);
		expect(skipButtonVisible(75, span, false)).toBe(false);
		expect(skipButtonVisible(75, span, true)).toBe(true);
	});
});

describe('isSkipMode', () => {
	it('accepts only the known modes', () => {
		expect(isSkipMode('auto')).toBe(true);
		expect(isSkipMode('always')).toBe(false);
	});
});
