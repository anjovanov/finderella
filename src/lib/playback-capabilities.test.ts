import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let supportedTypes: Set<string>;
let typeChecks: number;
let encodable: Set<string>;

class FakeMediaSource {
	static isTypeSupported(type: string): boolean {
		typeChecks++;
		return supportedTypes.has(type);
	}
}

let surroundChannels: number;
let surroundPlayable: boolean | 'throws';

const FakeAudioEncoder = {
	isConfigSupported: vi.fn(async (config: AudioEncoderConfig) => ({
		supported: encodable.has(config.codec) && config.numberOfChannels <= surroundChannels,
		config
	}))
};

/** Fresh module per test: the answer is cached at module level. */
const load = () => import('./playback-capabilities');

beforeEach(() => {
	vi.resetModules();
	typeChecks = 0;
	supportedTypes = new Set([
		'video/mp4; codecs="avc1.640028"',
		'video/mp4; codecs="hvc1.2.4.L150.90"',
		'audio/mp4; codecs="mp4a.40.2"',
		'audio/mp4; codecs="opus"',
		'audio/mp4; codecs="mp4a.6B"'
	]);
	encodable = new Set(['opus']);
	surroundChannels = 6;
	surroundPlayable = true;
	vi.stubGlobal('MediaSource', FakeMediaSource);
	vi.stubGlobal('AudioEncoder', FakeAudioEncoder);
	vi.stubGlobal('navigator', {
		mediaCapabilities: {
			decodingInfo: vi.fn(async () => {
				if (surroundPlayable === 'throws') throw new TypeError('unsupported');
				return { supported: surroundPlayable };
			})
		}
	});
});
afterEach(() => vi.unstubAllGlobals());

describe('playbackCapabilities', () => {
	it('lists what MSE takes and which encoders exist', async () => {
		const { playbackCapabilities } = await load();
		expect(await playbackCapabilities()).toEqual({
			// Main 10 alone is enough to call it HEVC.
			video: ['h264', 'hevc'],
			// Any of the MP3 spellings counts.
			audio: ['aac', 'mp3', 'opus'],
			encode: ['opus'],
			surround: ['opus']
		});
	});

	it('offers 5.1 only when Opus encodes 6 channels and MSE plays them', async () => {
		surroundChannels = 2;
		expect((await (await load()).playbackCapabilities())?.surround).toEqual([]);
		vi.resetModules();
		surroundChannels = 6;
		surroundPlayable = false;
		expect((await (await load()).playbackCapabilities())?.surround).toEqual([]);
		vi.resetModules();
		surroundPlayable = 'throws';
		expect((await (await load()).playbackCapabilities())?.surround).toEqual([]);
	});

	it('asks once per tab', async () => {
		const { playbackCapabilities } = await load();
		await playbackCapabilities();
		const checks = typeChecks;
		await playbackCapabilities();
		expect(typeChecks).toBe(checks);
	});

	it('uses ManagedMediaSource where MediaSource is missing (iOS)', async () => {
		vi.stubGlobal('MediaSource', undefined);
		vi.stubGlobal('ManagedMediaSource', FakeMediaSource);
		const caps = await (await load()).playbackCapabilities();
		expect(caps?.video).toContain('h264');
	});

	it('is null without Media Source Extensions', async () => {
		vi.stubGlobal('MediaSource', undefined);
		expect(await (await load()).playbackCapabilities()).toBeNull();
	});

	it('has no encoders without WebCodecs', async () => {
		vi.stubGlobal('AudioEncoder', undefined);
		const caps = await (await load()).playbackCapabilities();
		expect(caps?.encode).toEqual([]);
		expect(caps?.surround).toEqual([]);
	});
});
