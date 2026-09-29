import { describe, expect, it } from 'vitest';
import { parseBlackframeOutput } from './darkframes.js';

describe('parseBlackframeOutput', () => {
	it('pairs frames with their pblack and applies the seek offset', () => {
		const stdout = [
			'frame:0    pts:0       pts_time:0',
			'lavfi.blackframe.pblack=12',
			'frame:1    pts:5005    pts_time:5.005',
			'lavfi.blackframe.pblack=97',
			'garbage line',
			'frame:2    pts:10010   pts_time:10.01',
			'lavfi.blackframe.pblack=100'
		].join('\n');
		expect(parseBlackframeOutput(stdout, 60_000)).toEqual({
			timesMs: [60_000, 65_005, 70_010],
			pblack: [12, 97, 100]
		});
	});

	it('skips frames without a value and values without a frame', () => {
		const stdout = [
			'lavfi.blackframe.pblack=50',
			'frame:0 pts:0 pts_time:1',
			'frame:1 pts:1 pts_time:2',
			'lavfi.blackframe.pblack=90'
		].join('\n');
		expect(parseBlackframeOutput(stdout, 0)).toEqual({ timesMs: [2000], pblack: [90] });
	});

	it('handles CRLF and empty output', () => {
		expect(parseBlackframeOutput('', 0)).toEqual({ timesMs: [], pblack: [] });
		expect(
			parseBlackframeOutput('frame:0 pts:0 pts_time:0.5\r\nlavfi.blackframe.pblack=88\r\n', 0)
		).toEqual({ timesMs: [500], pblack: [88] });
	});
});
