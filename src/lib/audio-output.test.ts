import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let reportedChannels = 2;
let contextsCreated = 0;
class FakeContext {
	destination = { maxChannelCount: reportedChannels };
	constructor() {
		contextsCreated++;
	}
	close = async () => {};
}

let devices: EventTarget;
let decodingInfo: ReturnType<typeof vi.fn>;

/** Fresh module per test: the channel count and decode answer are cached at module level. */
const load = () => import('./audio-output');

beforeEach(() => {
	vi.resetModules();
	reportedChannels = 2;
	contextsCreated = 0;
	devices = new EventTarget();
	decodingInfo = vi.fn(async () => ({ supported: true }));
	vi.stubGlobal('AudioContext', FakeContext);
	vi.stubGlobal('MediaSource', class {});
	vi.stubGlobal('navigator', { mediaDevices: devices, mediaCapabilities: { decodingInfo } });
});
afterEach(() => vi.unstubAllGlobals());

describe('detectOutputChannels', () => {
	it('reads the device once and caches it', async () => {
		const { detectOutputChannels } = await load();
		reportedChannels = 6;
		expect(await detectOutputChannels()).toBe(6);
		reportedChannels = 2;
		expect(await detectOutputChannels()).toBe(6);
		expect(contextsCreated).toBe(1);
	});

	it('asks again after the media devices change', async () => {
		const { detectOutputChannels } = await load();
		expect(await detectOutputChannels()).toBe(2);
		reportedChannels = 8;
		devices.dispatchEvent(new Event('devicechange'));
		expect(await detectOutputChannels()).toBe(8);
	});

	it('is null when Web Audio is missing or reports nonsense', async () => {
		vi.stubGlobal('AudioContext', undefined);
		expect(await (await load()).detectOutputChannels()).toBeNull();
		vi.resetModules();
		vi.stubGlobal('AudioContext', FakeContext);
		reportedChannels = 0;
		expect(await (await load()).detectOutputChannels()).toBeNull();
	});
});

describe('canDecodeSurround', () => {
	it('asks Media Capabilities about 6-channel AAC over MSE', async () => {
		expect(await (await load()).canDecodeSurround()).toBe(true);
		expect(decodingInfo).toHaveBeenCalledWith({
			type: 'media-source',
			audio: { contentType: 'audio/mp4; codecs="mp4a.40.2"', channels: '6' }
		});
	});

	it('asks about a plain file where MSE is missing', async () => {
		vi.stubGlobal('MediaSource', undefined);
		await (await load()).canDecodeSurround();
		expect(decodingInfo.mock.calls[0][0].type).toBe('file');
	});

	it('only an explicit "no" disables surround', async () => {
		decodingInfo.mockResolvedValueOnce({ supported: false });
		expect(await (await load()).canDecodeSurround()).toBe(false);
		vi.resetModules();
		decodingInfo.mockRejectedValueOnce(new TypeError('unsupported'));
		expect(await (await load()).canDecodeSurround()).toBe(true);
		vi.resetModules();
		vi.stubGlobal('navigator', {});
		expect(await (await load()).canDecodeSurround()).toBe(true);
	});
});

describe('maxAudioChannels', () => {
	it('resolves each setting on this device', async () => {
		const { maxAudioChannels } = await load();
		expect(await maxAudioChannels('mono')).toBe(1);
		expect(await maxAudioChannels('stereo')).toBe(2);
		expect(await maxAudioChannels('surround')).toBe(6);
		expect(await maxAudioChannels('auto')).toBe(2); // device reports 2
	});

	it('auto picks surround on a 6+ channel device the browser can decode for', async () => {
		reportedChannels = 6;
		expect(await (await load()).maxAudioChannels('auto')).toBe(6);
		vi.resetModules();
		decodingInfo.mockResolvedValue({ supported: false });
		expect(await (await load()).maxAudioChannels('auto')).toBe(2);
		expect(await (await load()).maxAudioChannels('surround')).toBe(2);
	});

	it('stereo and mono never probe the device', async () => {
		const { maxAudioChannels } = await load();
		await maxAudioChannels('stereo');
		await maxAudioChannels('mono');
		expect(contextsCreated).toBe(0);
		expect(decodingInfo).not.toHaveBeenCalled();
	});
});
