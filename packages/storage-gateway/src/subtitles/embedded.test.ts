import { describe, expect, it } from 'vitest';
import { embeddedSubtitles } from './embedded.js';

describe('embeddedSubtitles', () => {
	it('keeps text tracks with their absolute stream index and drops bitmap ones', () => {
		const tracks = embeddedSubtitles([
			{ index: 0, codec_type: 'video', codec_name: 'hevc' },
			{ index: 1, codec_type: 'audio', codec_name: 'eac3' },
			{
				index: 2,
				codec_type: 'subtitle',
				codec_name: 'subrip',
				tags: { language: 'eng', title: 'English (SDH)' },
				disposition: { default: 1, forced: 0, hearing_impaired: 1 }
			},
			{
				index: 3,
				codec_type: 'subtitle',
				codec_name: 'hdmv_pgs_subtitle',
				tags: { language: 'eng' }
			},
			{
				index: 4,
				codec_type: 'subtitle',
				codec_name: 'ass',
				tags: { language: 'jpn' },
				disposition: { forced: 1 }
			}
		]);
		expect(tracks).toEqual([
			{
				source: 'embedded',
				streamIndex: 2,
				codec: 'subrip',
				language: 'en',
				title: 'English (SDH)',
				isDefault: true,
				forced: false,
				hearingImpaired: true
			},
			{
				source: 'embedded',
				streamIndex: 4,
				codec: 'ass',
				language: 'ja',
				title: undefined,
				isDefault: false,
				forced: true,
				hearingImpaired: false
			}
		]);
	});

	it('leaves the language undefined for und / unknown tags', () => {
		const [track] = embeddedSubtitles([
			{ index: 5, codec_type: 'subtitle', codec_name: 'mov_text', tags: { language: 'und' } }
		]);
		expect(track.language).toBeUndefined();
		expect(embeddedSubtitles(undefined)).toEqual([]);
	});
});
