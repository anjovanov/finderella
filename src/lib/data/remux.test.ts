import { describe, expect, it } from 'vitest';
import { remuxPlan, type PlaybackCapabilities } from './remux';

const firefoxLinux: PlaybackCapabilities = {
	video: ['h264', 'hevc', 'vp9', 'av1'],
	audio: ['aac', 'mp3', 'opus', 'flac'],
	encode: ['opus'],
	surround: ['opus']
};
const safari: PlaybackCapabilities = {
	video: ['h264', 'hevc'],
	audio: ['aac', 'mp3', 'flac', 'ac3', 'eac3'],
	encode: ['aac'],
	surround: []
};
const stereoOnly: PlaybackCapabilities = { ...firefoxLinux, surround: [] };
const noHevc: PlaybackCapabilities = { ...firefoxLinux, video: ['h264', 'vp9', 'av1'] };

const mkv = (videoCodec: string | null) => ({ container: 'mkv', videoCodec });
const track = (codec: string, channels: number | null = 2) => ({ codec, channels });

describe('remuxPlan', () => {
	it('copies audio the browser plays natively, surround included', () => {
		expect(remuxPlan(mkv('hevc'), track('aac', 6), firefoxLinux, 6)).toEqual({
			audioAction: 'copy',
			audioChannels: null
		});
		expect(remuxPlan(mkv('hevc'), track('eac3', 6), safari, 6)).toEqual({
			audioAction: 'copy',
			audioChannels: null
		});
	});

	it('converts AC-3 / E-AC-3 to stereo for a stereo viewer', () => {
		expect(remuxPlan(mkv('h264'), track('eac3', 6), firefoxLinux, 2)).toEqual({
			audioAction: 'convert',
			audioChannels: 2
		});
		// Mono viewers get stereo too; the player folds it to mono.
		expect(remuxPlan(mkv('hevc'), track('ac3', 6), firefoxLinux, 1)).toEqual({
			audioAction: 'convert',
			audioChannels: 2
		});
		expect(remuxPlan(mkv('hevc'), track('ac3'), { ...firefoxLinux, encode: [] }, 2)).toBeNull();
	});

	it('keeps 5.1 for a surround viewer when the browser can encode it', () => {
		expect(remuxPlan(mkv('hevc'), track('ac3', 6), firefoxLinux, 6)).toEqual({
			audioAction: 'convert',
			audioChannels: 6
		});
	});

	it('leaves 5.1 to the transcoder when the browser can only encode stereo', () => {
		expect(remuxPlan(mkv('hevc'), track('eac3', 6), stereoOnly, 6)).toBeNull();
		// 7.1 is folded to 5.1 by the transcoder, not the browser.
		expect(remuxPlan(mkv('hevc'), track('eac3', 8), firefoxLinux, 6)).toBeNull();
	});

	it('converts stereo sources to stereo even for a surround viewer', () => {
		expect(remuxPlan(mkv('hevc'), track('ac3', 2), stereoOnly, 6)).toEqual({
			audioAction: 'convert',
			audioChannels: 2
		});
		// Unknown layout (older devices don't report it): stereo, as the transcode would.
		expect(remuxPlan(mkv('hevc'), track('ac3', null), stereoOnly, 6)).toEqual({
			audioAction: 'convert',
			audioChannels: 2
		});
	});

	it('refuses audio it can neither copy nor convert', () => {
		expect(remuxPlan(mkv('h264'), track('dts', 6), firefoxLinux, 2)).toBeNull();
		expect(remuxPlan(mkv('h264'), track('truehd', 8), safari, 2)).toBeNull();
	});

	it('handles files without audio', () => {
		expect(remuxPlan(mkv('h264'), null, firefoxLinux)).toEqual({
			audioAction: 'none',
			audioChannels: null
		});
	});

	it('needs a video codec the browser decodes', () => {
		expect(remuxPlan(mkv('hevc'), track('aac'), noHevc)).toBeNull();
		expect(remuxPlan(mkv('mpeg2video'), track('aac'), firefoxLinux)).toBeNull();
		// Unprobed files can't be vetted.
		expect(remuxPlan(mkv(null), track('aac'), firefoxLinux)).toBeNull();
	});

	it('accepts codec aliases and container case', () => {
		expect(remuxPlan({ container: 'MKV', videoCodec: 'avc1' }, track('AAC'), noHevc)).toEqual({
			audioAction: 'copy',
			audioChannels: null
		});
	});

	it('only reads containers the in-browser demuxer supports', () => {
		expect(
			remuxPlan({ container: 'mp4', videoCodec: 'hevc' }, track('aac'), safari)
		).not.toBeNull();
		expect(
			remuxPlan({ container: 'avi', videoCodec: 'h264' }, track('aac'), firefoxLinux)
		).toBeNull();
		expect(
			remuxPlan({ container: 'ts', videoCodec: 'h264' }, track('aac'), firefoxLinux)
		).toBeNull();
	});

	it('never remuxes without capabilities (old clients)', () => {
		expect(remuxPlan(mkv('h264'), track('aac'), null)).toBeNull();
		expect(remuxPlan(mkv('h264'), track('aac'), undefined)).toBeNull();
	});
});
