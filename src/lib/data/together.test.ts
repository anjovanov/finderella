import { describe, expect, it } from 'vitest';
import {
	clockOffset,
	expectedPosition,
	listNames,
	partySearch,
	partySkipMode,
	planSync,
	sameMedia,
	withParty,
	type TogetherState
} from './together';

const state = (patch: Partial<TogetherState> = {}): TogetherState => ({
	seq: 1,
	media: { kind: 'movie', slug: 'm' },
	playing: true,
	waiting: false,
	position: 100,
	anchorAt: 10_000,
	waitingFor: [],
	...patch
});

describe('expectedPosition', () => {
	it('advances while running', () => {
		expect(expectedPosition(state(), 12_500)).toBe(102.5);
	});

	it('holds while paused or waiting', () => {
		expect(expectedPosition(state({ playing: false }), 20_000)).toBe(100);
		expect(expectedPosition(state({ waiting: true }), 20_000)).toBe(100);
	});

	it('never runs backwards when the client clock is behind', () => {
		expect(expectedPosition(state(), 9_000)).toBe(100);
	});
});

describe('planSync', () => {
	const local = (time: number, rate = 1, paused = false) => ({ time, rate, paused });

	it('hard-seeks large drift', () => {
		expect(planSync(local(90), { position: 100, running: true })).toEqual({
			seekTo: 100,
			play: true,
			rate: 1
		});
	});

	it('jumps smaller drift when the target is already buffered', () => {
		expect(planSync(local(98.5), { position: 100, running: true }).seekTo).toBeNull();
		expect(planSync(local(98.5), { position: 100, running: true, buffered: true }).seekTo).toBe(
			100
		);
	});

	it('nudges the rate for small drift, in the right direction', () => {
		expect(planSync(local(99.5), { position: 100, running: true }).rate).toBeGreaterThan(1);
		expect(planSync(local(100.5), { position: 100, running: true }).rate).toBeLessThan(1);
		expect(planSync(local(99.5), { position: 100, running: true }).seekTo).toBeNull();
	});

	it('keeps nudging until well inside the band, then resets', () => {
		// 0.2 s off: wouldn't start a nudge…
		expect(planSync(local(99.8), { position: 100, running: true }).rate).toBe(1);
		// …but doesn't stop one either.
		expect(planSync(local(99.8, 1.05), { position: 100, running: true }).rate).toBe(1.05);
		expect(planSync(local(99.95, 1.05), { position: 100, running: true }).rate).toBe(1);
	});

	it('pauses and only seeks visibly-off positions when not running', () => {
		expect(planSync(local(100.1), { position: 100, running: false })).toEqual({
			seekTo: null,
			play: false,
			rate: 1
		});
		expect(planSync(local(103, 1, true), { position: 100, running: false }).seekTo).toBe(100);
	});
});

describe('clockOffset', () => {
	it('uses the shortest round trip', () => {
		expect(
			clockOffset([
				{ t0: 0, t1: 400, serverTime: 5_000 }, // noisy
				{ t0: 1_000, t1: 1_020, serverTime: 6_010 } // offset 5000
			])
		).toBe(5_000);
	});

	it('is 0 without samples and ignores impossible ones', () => {
		expect(clockOffset([])).toBe(0);
		expect(clockOffset([{ t0: 10, t1: 5, serverTime: 99 }])).toBe(0);
	});
});

describe('helpers', () => {
	it('compares media by title and episode', () => {
		expect(sameMedia({ kind: 'movie', slug: 'a' }, { kind: 'movie', slug: 'a' })).toBe(true);
		expect(
			sameMedia(
				{ kind: 'series', slug: 's', episodeSlug: 'e1' },
				{ kind: 'series', slug: 's', episodeSlug: 'e2' }
			)
		).toBe(false);
		expect(sameMedia({ kind: 'movie', slug: 'a' }, { kind: 'movie', slug: 'b' })).toBe(false);
	});

	it('adds the party param', () => {
		expect(withParty('/movies/x/watch', 'abc')).toBe('/movies/x/watch?party=abc');
		expect(withParty('/a?b=1', 'abc')).toBe('/a?b=1&party=abc');
	});

	it('rewrites the party query, dropping the one-shot invite flag', () => {
		expect(partySearch('?party=old&invite=1&t=5', 'new')).toBe('?t=5&party=new');
		expect(partySearch('?party=old&invite=1', null)).toBe('');
		expect(partySearch('', 'abc')).toBe('?party=abc');
	});

	it('lists names', () => {
		expect(listNames(['Ana'])).toBe('Ana');
		expect(listNames(['Ana', 'Ben'])).toBe('Ana and Ben');
		expect(listNames(['Ana', 'Ben', 'Cy'])).toBe('Ana, Ben and Cy');
		expect(listNames(['Ana', 'Ben', 'Cy', 'Di'])).toBe('Ana, Ben and 2 others');
	});

	it('downgrades automatic skipping in a party', () => {
		expect(partySkipMode('auto')).toBe('show');
		expect(partySkipMode('off')).toBe('off');
		expect(partySkipMode('show')).toBe('show');
	});
});
