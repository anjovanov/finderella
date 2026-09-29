import { describe, expect, it } from 'vitest';
import { probedChapters } from './chapters.js';

describe('probedChapters', () => {
	it('converts, trims and sorts', () => {
		expect(
			probedChapters([
				{ start_time: '90.5', end_time: '180', tags: { title: ' Opening ' } },
				{ start_time: '0.000000', end_time: '90.5', tags: { title: 'Prologue' } },
				{ start_time: '180', end_time: '200' }
			])
		).toEqual([
			{ startMs: 0, endMs: 90_500, title: 'Prologue' },
			{ startMs: 90_500, endMs: 180_000, title: 'Opening' },
			{ startMs: 180_000, endMs: 200_000 }
		]);
	});

	it('drops broken entries', () => {
		expect(
			probedChapters([
				{ start_time: 'N/A', end_time: '10' },
				{ start_time: '20', end_time: '10' },
				{ start_time: '-1', end_time: '10' }
			])
		).toEqual([]);
		expect(probedChapters(undefined)).toEqual([]);
	});
});
