import { describe, expect, it } from 'vitest';
import {
	audioCodecLabel,
	audioDetails,
	audioName,
	channelLabel,
	formatBitrate,
	formatBytes,
	videoCodecLabel
} from './media-format';
import type { AudioFormat } from './types';

const track: AudioFormat = {
	codec: 'eac3',
	language: 'en',
	title: null,
	channels: 6,
	isDefault: true,
	commentary: false,
	descriptive: false
};

describe('media format labels', () => {
	it('names common codecs and falls back to the raw name', () => {
		expect(videoCodecLabel('hevc')).toBe('H.265 (HEVC)');
		expect(videoCodecLabel('prores')).toBe('PRORES');
		expect(videoCodecLabel(null)).toBe('Unknown');
		expect(audioCodecLabel('pcm_s24le')).toBe('PCM');
		expect(audioCodecLabel('dts')).toBe('DTS');
	});

	it('formats channels, sizes and bitrates', () => {
		expect(channelLabel(6)).toBe('5.1');
		expect(channelLabel(3)).toBe('3 ch');
		expect(channelLabel(null)).toBeNull();
		expect(formatBytes(700 * 1024 * 1024)).toBe('700 MB');
		expect(formatBytes(14.2 * 1024 ** 3)).toBe('14.2 GB');
		expect(formatBitrate(18_340_000)).toBe('18.3 Mb/s');
		expect(formatBitrate(850_000)).toBe('850 kb/s');
	});

	it('describes an audio stream', () => {
		expect(audioName(track, 0)).toBe('English');
		expect(audioName({ ...track, language: null, title: 'Original mix' }, 0)).toBe('Original mix');
		expect(audioName({ ...track, language: null }, 1)).toBe('Track 2');
		expect(audioDetails(track)).toBe('Dolby Digital Plus (E-AC-3) 5.1');
		expect(audioDetails({ ...track, codec: 'aac', channels: null, commentary: true })).toBe(
			'AAC · Commentary'
		);
	});
});
