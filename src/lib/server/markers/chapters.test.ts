import { describe, expect, it } from 'vitest';
import { chapterMarkers } from './chapters';

const MIN = 60_000;

describe('chapterMarkers', () => {
	it('reads an anime OP / ED / preview layout', () => {
		const markers = chapterMarkers(
			[
				{ startMs: 0, endMs: 90_000, title: 'Prologue' },
				{ startMs: 90_000, endMs: 180_000, title: 'Opening' },
				{ startMs: 180_000, endMs: 20 * MIN, title: 'Part A' },
				{ startMs: 20 * MIN, endMs: 21.5 * MIN, title: 'Ending' },
				{ startMs: 21.5 * MIN, endMs: 22 * MIN, title: 'Preview' }
			],
			22 * MIN
		);
		expect(markers).toEqual([
			{ kind: 'intro', source: 'chapter', startMs: 90_000, endMs: 180_000, confidence: 1 },
			{ kind: 'credits', source: 'chapter', startMs: 20 * MIN, endMs: 21.5 * MIN, confidence: 1 }
		]);
	});

	it('accepts common spellings', () => {
		const markers = chapterMarkers(
			[
				{ startMs: 0, endMs: 30_000, title: 'Intro' },
				{ startMs: 30_000, endMs: 40 * MIN, title: 'Episode' },
				{ startMs: 40 * MIN, endMs: 42 * MIN, title: 'End Credits' }
			],
			42 * MIN
		);
		expect(markers.map((m) => m.kind)).toEqual(['intro', 'credits']);
	});

	it('ignores generic and story chapters', () => {
		expect(
			chapterMarkers(
				[
					{ startMs: 0, endMs: 60_000, title: 'Chapter 1' },
					{ startMs: 60_000, endMs: 120_000, title: 'Opening Night' },
					{ startMs: 120_000, endMs: 40 * MIN, title: 'Chapter 3' },
					{ startMs: 40 * MIN, endMs: 42 * MIN }
				],
				42 * MIN
			)
		).toEqual([]);
	});

	it('rejects implausible positions and lengths', () => {
		expect(
			chapterMarkers(
				[
					{ startMs: 30 * MIN, endMs: 31 * MIN, title: 'Opening' },
					{ startMs: 5 * MIN, endMs: 7 * MIN, title: 'Credits' },
					{ startMs: 0, endMs: 5000, title: 'Intro' }
				],
				42 * MIN
			)
		).toEqual([]);
		expect(chapterMarkers([{ startMs: 0, endMs: 30_000, title: 'Intro' }], null)).toEqual([]);
	});
});
