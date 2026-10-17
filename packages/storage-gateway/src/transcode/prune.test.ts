import { describe, expect, it } from 'vitest';
import { segmentsToPrune } from './prune.js';

describe('segmentsToPrune', () => {
	const names = [
		'init.mp4',
		'playlist.m3u8',
		'playlist.m3u8.tmp',
		'seg-0.m4s',
		'seg-1.m4s',
		'seg-2.m4s',
		'seg-3.m4s',
		'seg-3.m4s.patch',
		'seg-10.m4s'
	];

	it('keeps the window behind the served segment and everything ahead', () => {
		expect(segmentsToPrune(names, 4, 2)).toEqual([0, 1]);
		expect(segmentsToPrune(names, 2, 2)).toEqual([]);
	});

	it('only touches finished segment files', () => {
		expect(segmentsToPrune(names, 100, 2)).toEqual([0, 1, 2, 3, 10]);
	});
});
