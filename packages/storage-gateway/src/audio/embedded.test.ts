import { describe, expect, it } from 'vitest';
import { embeddedAudio } from './embedded.js';

describe('embeddedAudio', () => {
	it('keeps every audio stream with its absolute index, language and flags', () => {
		const tracks = embeddedAudio([
			{ index: 0, codec_type: 'video', codec_name: 'hevc' },
			{
				index: 1,
				codec_type: 'audio',
				codec_name: 'eac3',
				channels: 6,
				tags: { language: 'eng', title: 'Surround 5.1' },
				disposition: { default: 1 }
			},
			{ index: 2, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'eng' } },
			{
				index: 3,
				codec_type: 'audio',
				codec_name: 'aac',
				channels: 2,
				tags: { language: 'jpn' }
			},
			{
				index: 4,
				codec_type: 'audio',
				codec_name: 'ac3',
				channels: 2,
				tags: { language: 'eng', title: '  ' },
				disposition: { comment: 1, visual_impaired: 1 }
			}
		]);
		expect(tracks).toEqual([
			{
				streamIndex: 1,
				codec: 'eac3',
				language: 'en',
				title: 'Surround 5.1',
				channels: 6,
				isDefault: true,
				commentary: false,
				descriptive: false
			},
			{
				streamIndex: 3,
				codec: 'aac',
				language: 'ja',
				title: undefined,
				channels: 2,
				isDefault: false,
				commentary: false,
				descriptive: false
			},
			{
				streamIndex: 4,
				codec: 'ac3',
				language: 'en',
				title: undefined,
				channels: 2,
				isDefault: false,
				commentary: true,
				descriptive: true
			}
		]);
	});

	it('leaves the language and channels undefined when unknown', () => {
		const [track] = embeddedAudio([
			{ index: 1, codec_type: 'audio', codec_name: 'opus', channels: 0, tags: { language: 'und' } }
		]);
		expect(track.language).toBeUndefined();
		expect(track.channels).toBeUndefined();
		expect(embeddedAudio(undefined)).toEqual([]);
	});
});
