/**
 * What this browser and device can play, for the audio-channels setting:
 * the output device's channel count, as Web Audio reports it
 * (`destination.maxChannelCount`: 2 for headphones/laptop speakers, 6 or 8
 * for a surround setup), and whether the browser decodes 5.1 AAC — what a
 * surround transcode delivers.
 */

import {
	resolveAudioChannels,
	type AudioChannels,
	type ChannelCount
} from './data/playback-settings';

let outputChannels: number | null | undefined;
let listening = false;

/**
 * Forget the cached channel count when the set of media devices changes
 * (headphones plugged in, a receiver switched on), so the next playback
 * start asks again. Switching the OS default output without a device
 * appearing or disappearing may not fire the event — a reload covers that.
 */
function watchDevices(): void {
	if (listening) return;
	listening = true;
	try {
		navigator.mediaDevices?.addEventListener('devicechange', () => {
			outputChannels = undefined;
		});
	} catch {
		// No mediaDevices (insecure context, old browser): the value stays cached for the tab.
	}
}

/** Reported output channels, or null when the browser can't tell. Cached until the devices change. */
export async function detectOutputChannels(): Promise<number | null> {
	watchDevices();
	if (outputChannels !== undefined) return outputChannels;
	try {
		// A context created without a user gesture starts suspended — fine, it is
		// only asked about the device and closed again.
		const context = new AudioContext();
		const channels = context.destination.maxChannelCount;
		await context.close().catch(() => {});
		outputChannels = Number.isFinite(channels) && channels > 0 ? channels : null;
	} catch {
		outputChannels = null;
	}
	return outputChannels;
}

let surround: boolean | undefined;

/**
 * Can this browser decode the 5.1 AAC a surround transcode sends? Asked via
 * Media Capabilities in the same delivery the player uses (MSE through
 * hls.js, or a plain `file` where MSE is missing). Only an explicit "no"
 * counts: without the API, or when it errors, surround is assumed to work
 * (AAC 5.1 decoding is near universal — the browser downmixes it if needed).
 */
export async function canDecodeSurround(): Promise<boolean> {
	if (surround !== undefined) return surround;
	try {
		const info = await navigator.mediaCapabilities.decodingInfo({
			type: typeof MediaSource === 'undefined' ? 'file' : 'media-source',
			audio: { contentType: 'audio/mp4; codecs="mp4a.40.2"', channels: '6' }
		});
		surround = info.supported;
	} catch {
		surround = true;
	}
	return surround;
}

/** The `maxAudioChannels` to request for the viewer's setting on this device. */
export async function maxAudioChannels(setting: AudioChannels): Promise<ChannelCount> {
	const [deviceMax, decodable] = await Promise.all([
		setting === 'auto' ? detectOutputChannels() : null,
		setting === 'auto' || setting === 'surround' ? canDecodeSurround() : true
	]);
	return resolveAudioChannels(setting, deviceMax, decodable);
}
