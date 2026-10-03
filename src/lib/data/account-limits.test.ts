import { describe, expect, it } from 'vitest';
import { canAddProfile, sessionsToEvict } from './account-limits';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 3, 12, minute));
const s = (id: string, minute: number) => ({ id, lastUsed: at(minute) });

describe('canAddProfile', () => {
	it('allows adding below the limit and always when unlimited', () => {
		expect(canAddProfile(4, 5)).toBe(true);
		expect(canAddProfile(5, 5)).toBe(false);
		expect(canAddProfile(7, 5)).toBe(false);
		expect(canAddProfile(50, null)).toBe(true);
	});
});

describe('sessionsToEvict', () => {
	const sessions = [s('a', 10), s('b', 30), s('c', 20), s('new', 40)];

	it('evicts nothing when unlimited or within the limit', () => {
		expect(sessionsToEvict(sessions, 'new', null)).toEqual([]);
		expect(sessionsToEvict(sessions, 'new', 4)).toEqual([]);
		expect(sessionsToEvict(sessions, 'new', 10)).toEqual([]);
	});

	it('signs out the least recently used session when one over', () => {
		expect(sessionsToEvict(sessions, 'new', 3)).toEqual(['a']);
	});

	it('gets all the way back to a lowered limit, oldest first', () => {
		expect(sessionsToEvict(sessions, 'new', 1)).toEqual(['a', 'c', 'b']);
	});

	it('never evicts the new session, even when it looks oldest', () => {
		const stale = [s('new', 0), s('x', 10), s('y', 20)];
		expect(sessionsToEvict(stale, 'new', 1)).toEqual(['x', 'y']);
	});

	it('picks a stable set on ties', () => {
		const tied = [s('p', 5), s('q', 5), s('new', 9)];
		expect(sessionsToEvict(tied, 'new', 2)).toHaveLength(1);
	});
});
