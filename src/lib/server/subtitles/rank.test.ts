import { describe, expect, it } from 'vitest';
import { rankCandidates, releaseOverlap } from './rank';
import type { SubtitleCandidate } from './providers/types';

function candidate(overrides: Partial<SubtitleCandidate> & { id: string }): SubtitleCandidate {
	return {
		provider: 'opensubtitles',
		language: 'en',
		releaseName: '',
		hearingImpaired: false,
		forced: false,
		downloads: 0,
		rating: 0,
		trusted: false,
		aiTranslated: false,
		machineTranslated: false,
		hashMatch: false,
		...overrides
	};
}

const opts = {
	fileName: 'Inception.2010.1080p.BluRay.x264-SPARKS.mkv',
	preferHearingImpaired: false,
	providerOrder: ['opensubtitles', 'subdl'] as const
};

describe('releaseOverlap', () => {
	it('measures shared tokens ignoring filler and extensions', () => {
		expect(releaseOverlap(opts.fileName, 'Inception 2010 1080p BluRay SPARKS')).toBe(1);
		expect(releaseOverlap(opts.fileName, 'Inception.2010.WEB-DL')).toBeCloseTo(0.4);
		expect(releaseOverlap('', 'anything')).toBe(0);
	});
});

describe('rankCandidates', () => {
	it('prefers matching releases, then trusted/popular, and demotes HI, forced and machine translations', () => {
		const ranked = rankCandidates(
			[
				candidate({ id: 'popular', releaseName: 'Inception WEB-DL', downloads: 50_000 }),
				candidate({ id: 'match', releaseName: 'Inception.2010.1080p.BluRay.x264-SPARKS' }),
				candidate({
					id: 'hi',
					releaseName: 'Inception.2010.1080p.BluRay.x264-SPARKS',
					hearingImpaired: true
				}),
				candidate({
					id: 'mt',
					releaseName: 'Inception.2010.1080p.BluRay.x264-SPARKS',
					machineTranslated: true
				}),
				candidate({
					id: 'forced',
					releaseName: 'Inception.2010.1080p.BluRay.x264-SPARKS',
					forced: true
				}),
				candidate({ id: 'hash', releaseName: 'other', hashMatch: true })
			],
			{ ...opts, providerOrder: [...opts.providerOrder] }
		);
		expect(ranked.map((c) => c.id)).toEqual(['hash', 'match', 'popular', 'hi', 'forced', 'mt']);
	});

	it('honours the hearing-impaired preference and provider order for ties', () => {
		const ranked = rankCandidates(
			[
				candidate({ id: 'subdl', provider: 'subdl', hearingImpaired: true }),
				candidate({ id: 'os', hearingImpaired: true }),
				candidate({ id: 'plain' })
			],
			{ ...opts, preferHearingImpaired: true, providerOrder: ['subdl', 'opensubtitles'] }
		);
		expect(ranked.map((c) => c.id)).toEqual(['subdl', 'os', 'plain']);
	});
});
