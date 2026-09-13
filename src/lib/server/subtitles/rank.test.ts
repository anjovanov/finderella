import { describe, expect, it } from 'vitest';
import { matchReason, parseRelease, rankCandidates, releaseOverlap } from './rank';
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

describe('parseRelease', () => {
	it('reads group, source, network, resolution and codec; ignores site tags', () => {
		const show = parseRelease('Show.S01E02.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb.mkv');
		expect(show).toMatchObject({
			group: 'ntb',
			source: 'webdl',
			network: 'amzn',
			resolution: '1080p',
			codec: 'h264'
		});
		const movie = parseRelease('Movie.2010.BluRay.x264-SPARKS[EZTVx.to]');
		expect(movie).toMatchObject({ group: 'sparks', source: 'bluray', codec: 'h264' });
		const hevc = parseRelease('Lanterns.2026.S01E01.1080p.HEVC.x265-MeGusta[EZTVx.to].mkv');
		expect(hevc).toMatchObject({ group: 'megusta', codec: 'h265', resolution: '1080p' });
		expect(hevc.source).toBeUndefined();
		expect(
			parseRelease('Avatar.Fire.And.Ash.2025.1080p.WEBRip.x264.AAC5.1-[YTS.BZ].mp4')
		).toMatchObject({
			group: 'yts',
			source: 'webrip',
			codec: 'h264'
		});
		expect(parseRelease('1080p.WEBRip.x264.AAC5.1-[YTS.BZ]').group).toBe('yts');
		expect(parseRelease('Some Movie').group).toBeUndefined();
		expect(parseRelease('Show.S01E01.REPACK.720p.HDTV.x264-KILLERS').repack).toBe(true);
	});
});

describe('releaseOverlap / matchReason', () => {
	it('measures leftover-token overlap and explains a match', () => {
		expect(releaseOverlap(opts.fileName, 'Inception 2010 1080p BluRay SPARKS')).toBe(1);
		expect(releaseOverlap('', 'anything')).toBe(0);
		expect(matchReason(candidate({ id: 'h', hashMatch: true }), opts.fileName)).toBe('hash');
		expect(
			matchReason(
				candidate({ id: 'r', releaseName: 'Inception.2010.720p.BluRay.x264-SPARKS' }),
				opts.fileName
			)
		).toBe('release');
		expect(
			matchReason(
				candidate({ id: 'p', releaseName: 'Inception.2010.1080p.BluRay.x264-AMIABLE' }),
				opts.fileName
			)
		).toBe('partial');
		expect(
			matchReason(candidate({ id: 'n', releaseName: 'Inception.2010.WEB-DL-NTb' }), opts.fileName)
		).toBeNull();
	});
});

describe('rankCandidates', () => {
	it('orders hash > same group+source > same source > popular other source > HI/forced/MT', () => {
		const ranked = rankCandidates(
			[
				candidate({
					id: 'popular',
					releaseName: 'Inception.2010.1080p.WEB-DL.x264-NTb',
					downloads: 50_000
				}),
				candidate({ id: 'same-source', releaseName: 'Inception.2010.1080p.BluRay.x264-AMIABLE' }),
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
		expect(ranked.map((c) => c.id)).toEqual([
			'hash',
			'match',
			'same-source',
			'hi',
			'forced',
			'popular',
			'mt'
		]);
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
