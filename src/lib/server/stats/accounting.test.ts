import { describe, expect, it } from 'vitest';
import {
	accumulate,
	canContinuePlay,
	CONTINUE_WINDOW_MS,
	MAX_BEAT_GAP_MS,
	newLivePlay,
	RateMeter,
	settle
} from './accounting';

const beat = (state: 'playing' | 'paused' | 'buffering', positionSeconds = 0) => ({
	state,
	positionSeconds,
	durationSeconds: 3600
});

describe('accumulate', () => {
	it('credits the gap to the state the player was in', () => {
		let live = newLivePlay(0);
		live = accumulate(live, beat('playing'), 0);
		live = accumulate(live, beat('playing', 10), 10_000);
		live = accumulate(live, beat('paused', 20), 20_000);
		live = accumulate(live, beat('paused', 20), 30_000);
		live = accumulate(live, beat('buffering', 20), 40_000);
		live = accumulate(live, beat('playing', 20), 45_000);
		expect(live.played).toBe(20);
		expect(live.paused).toBe(20);
		expect(live.positionSeconds).toBe(20);
		expect(live.beats).toBe(6);
	});

	it('caps a long silence', () => {
		let live = accumulate(newLivePlay(0), beat('playing'), 0);
		live = accumulate(live, beat('playing'), 10 * 60_000);
		expect(live.played).toBe(MAX_BEAT_GAP_MS / 1000);
	});

	it('keeps the subtitle track unless the beat carries one', () => {
		let live = accumulate(newLivePlay(0), { ...beat('playing'), subtitleTrackId: 'sub-1' }, 0);
		live = accumulate(live, beat('playing'), 1000);
		expect(live.subtitleTrackId).toBe('sub-1');
		live = accumulate(live, { ...beat('playing'), subtitleTrackId: null }, 2000);
		expect(live.subtitleTrackId).toBeNull();
	});
});

describe('settle', () => {
	const opts = { createdAt: 0, lastAccessAt: 90_000 };

	it('credits the tail on a viewer stop, not on an idle reap', () => {
		const live = accumulate(newLivePlay(0), beat('playing'), 0);
		expect(settle(live, 5_000, { ...opts, creditTail: true }).played).toBe(5);
		expect(settle(live, 5_000, { ...opts, creditTail: false }).played).toBe(0);
	});

	it('counts the whole lifetime when the player never sent a beat', () => {
		expect(settle(newLivePlay(0), 100_000, { ...opts, creditTail: true }).played).toBe(90);
	});
});

describe('canContinuePlay', () => {
	const now = 1_000_000_000;
	const row = {
		userId: 'u1',
		userAgent: 'ua-a',
		movieId: 'm1',
		episodeId: null,
		lastActiveAt: new Date(now - 60_000)
	};
	const next = { userId: 'u1', userAgent: 'ua-b', movieId: 'm1', episodeId: null };

	it('continues the same viewer on the same title within the window', () => {
		expect(canContinuePlay(row, next, now)).toBe(true);
	});

	it('starts a new row after the window, for another title or another viewer', () => {
		expect(
			canContinuePlay({ ...row, lastActiveAt: new Date(now - CONTINUE_WINDOW_MS - 1) }, next, now)
		).toBe(false);
		expect(canContinuePlay(row, { ...next, movieId: 'm2' }, now)).toBe(false);
		expect(canContinuePlay(row, { ...next, userId: 'u2' }, now)).toBe(false);
	});

	it('tells guests apart by browser', () => {
		const guestRow = { ...row, userId: null };
		expect(canContinuePlay(guestRow, { ...next, userId: null, userAgent: 'ua-a' }, now)).toBe(true);
		expect(canContinuePlay(guestRow, { ...next, userId: null }, now)).toBe(false);
	});

	it('matches episodes by episode id', () => {
		const episodeRow = { ...row, movieId: null, episodeId: 'e1' };
		const episodeNext = { ...next, movieId: null, episodeId: 'e1' };
		expect(canContinuePlay(episodeRow, episodeNext, now)).toBe(true);
		expect(canContinuePlay(episodeRow, { ...episodeNext, episodeId: 'e2' }, now)).toBe(false);
	});
});

describe('RateMeter', () => {
	it('reports bits per second over the last window and decays to 0', () => {
		const meter = new RateMeter(0);
		meter.add(1_000_000, 1_000);
		meter.add(1_500_000, 4_000);
		// Window rolls on the first read past 5 s: 2.5 MB over 5 s = 4 Mb/s.
		expect(meter.read(5_000)).toBe(4_000_000);
		expect(meter.read(20_000)).toBe(0);
	});
});
