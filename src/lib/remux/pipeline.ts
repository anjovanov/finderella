/**
 * Client-side remux: re-wrap a file's packets (MKV, …) as fragmented MP4 for
 * Media Source Extensions, copying the video and either copying or converting
 * the audio (AC-3 / E-AC-3 → stereo Opus or AAC). Framework-free — it runs in
 * Node as well (Mediabunny's demuxers/muxers are pure TS), which is how it
 * was validated against real files.
 *
 * Fragments are at least 4 s: ~1 s fragments made Firefox's MSE decoder fail
 * ("avcodec_send_packet: End of file") at a spot where key frames sit ~1 s
 * apart. Timestamps stay absolute after a seek (a run from 900 s produces
 * fragments at 896.7 s…), so MSE places them without `timestampOffset` —
 * unlike ffmpeg's HLS muxer, whose tfdt the gateway has to patch.
 */

import {
	AudioSample,
	AudioSampleSink,
	AudioSampleSource,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	Mp4OutputFormat,
	NullTarget,
	Output,
	QUALITY_HIGH,
	type EncodedPacket,
	type Input,
	type InputAudioTrack,
	type InputVideoTrack
} from 'mediabunny';
import { ac3MixLevels, type Ac3MixLevels } from './ac3-downmix';

/** What to do with the audio stream: pass it through, or decode and re-encode it. */
export type AudioAction = 'copy' | 'opus' | 'aac' | 'none';

export interface RemuxTracks {
	video: InputVideoTrack;
	audio: InputAudioTrack | null;
}

export interface RemuxOptions {
	/** Start position in seconds; the pipeline starts at the key frame at or before it. */
	start: number;
	audioAction: AudioAction;
	/** Stops the pump between packets. */
	signal?: AbortSignal;
	/** Init segment (ftyp + moov) + the exact MSE type of the output. Called once per run. */
	onInit: (data: Uint8Array, mimeType: string) => void | Promise<void>;
	/** One media segment (moof + mdat); `timestamp` = its start in seconds. */
	onSegment: (data: Uint8Array, timestamp: number) => void | Promise<void>;
	/** Called before each packet; resolve when the consumer has room (buffer-ahead window). */
	waitForRoom?: (position: number) => Promise<void>;
	/** Minimum fragment length in seconds (default 4; ~1 s fragments break Firefox MSE on some files). */
	fragmentSeconds?: number;
	/**
	 * Converted audio: 6 keeps a 5.1 source as 5.1 (the viewer's device plays
	 * surround and the browser can encode it), 2 mixes down to stereo (default).
	 */
	audioChannels?: 2 | 6;
}

interface AudioFeed {
	/** Timestamp of the next audio packet/sample, null at the end. */
	peek(): number | null;
	add(): Promise<void>;
}

export interface RemuxRunInfo {
	/** Timestamp of the key frame the run actually started from. */
	keyTimestamp: number;
	/** Predicted MSE type (input codec strings; the exact one comes with `onInit`). */
	mimeType: string;
}

/** Output codec string for the audio side, for the MSE mime type. */
function audioCodecString(action: AudioAction, copied: string | null): string | null {
	if (action === 'none') return null;
	if (action === 'opus') return 'opus';
	if (action === 'aac') return 'mp4a.40.2';
	return copied;
}

/**
 * Downmix a decoded sample to stereo f32-planar. 5.1 in ffmpeg order
 * (FL FR FC LFE SL SR, what the AC-3 decoder emits) uses the ITU coefficients
 * at full level — what ffmpeg's `-ac 2` does in front of the AAC encoder (the
 * transcode path) and what browsers do to 5.1 in direct play. A normalized
 * mix (÷ 1 + √2) came out 7.7 dB quieter than both. `levels` are the
 * stream's own center/surround mix levels (AC-3 metadata, see
 * `ac3MixLevels`), else ffmpeg's −3 dB. Anything else keeps its first two
 * channels (mono is duplicated).
 */
export function downmixToStereo(
	sample: AudioSample,
	levels: Ac3MixLevels = { center: Math.SQRT1_2, surround: Math.SQRT1_2 }
): AudioSample {
	const frames = sample.numberOfFrames;
	const channels = sample.numberOfChannels;
	const planes: Float32Array[] = [];
	for (let c = 0; c < channels; c++) {
		const plane = new Float32Array(frames);
		sample.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
		planes.push(plane);
	}
	const out = new Float32Array(frames * 2);
	const left = out.subarray(0, frames);
	const right = out.subarray(frames);
	if (channels === 1) {
		left.set(planes[0]);
		right.set(planes[0]);
	} else if (channels >= 6) {
		const [fl, fr, fc, , sl, sr] = planes;
		const { center: c, surround: s } = levels;
		for (let i = 0; i < frames; i++) {
			// Clamped: the rare peak past full scale must not overflow the encoder.
			left[i] = clamp(fl[i] + c * fc[i] + s * sl[i]);
			right[i] = clamp(fr[i] + c * fc[i] + s * sr[i]);
		}
	} else {
		left.set(planes[0]);
		right.set(planes[1]);
	}
	return new AudioSample({
		data: out,
		format: 'f32-planar',
		numberOfChannels: 2,
		sampleRate: sample.sampleRate,
		timestamp: sample.timestamp
	});
}

function clamp(value: number): number {
	return value > 1 ? 1 : value < -1 ? -1 : value;
}

/** Pick the primary video track and the given (or first) audio track. */
export async function pickTracks(input: Input, audioIndex = 0): Promise<RemuxTracks> {
	const video = await input.getPrimaryVideoTrack();
	if (!video) throw new Error('no video track');
	const audios = await input.getAudioTracks();
	return { video, audio: audios[audioIndex] ?? audios[0] ?? null };
}

/** The mime type the run will produce (for `MediaSource.isTypeSupported` / `addSourceBuffer`). */
export async function remuxMimeType(tracks: RemuxTracks, action: AudioAction): Promise<string> {
	// MKV reports `hev1`, but the MP4 muxer writes an `hvc1` sample entry
	// (parameter sets in hvcC) — that's what the SourceBuffer gets.
	const video = (await tracks.video.getCodecParameterString())?.replace(/^hev1\./, 'hvc1.');
	const copied = tracks.audio ? await tracks.audio.getCodecParameterString() : null;
	const audio = tracks.audio ? audioCodecString(action, copied) : null;
	return `video/mp4; codecs="${[video, audio].filter(Boolean).join(',')}"`;
}

/**
 * Run one remux from `start` until the end of the file (or abort). Pushes the
 * init segment, then media segments, through the callbacks. A seek outside the
 * buffered range = abort this run and start a new one.
 */
export async function runRemux(tracks: RemuxTracks, opts: RemuxOptions): Promise<RemuxRunInfo> {
	const { signal } = opts;
	const audioAction: AudioAction = tracks.audio ? opts.audioAction : 'none';
	const mimeType = await remuxMimeType(tracks, audioAction);

	const vSink = new EncodedPacketSink(tracks.video);
	const key =
		(await vSink.getKeyPacket(opts.start, { verifyKeyPackets: true })) ??
		(await vSink.getFirstPacket());
	if (!key) throw new Error('video track has no packets');

	let ftyp: Uint8Array | null = null;
	let moof: Uint8Array | null = null;
	let moofTimestamp = 0;
	// Muxer callbacks are synchronous; queue the consumer work as thunks and run
	// them strictly in order from the pump (init before segments, and appendBuffer
	// backpressure reaches the packet reader).
	const pending: (() => void | Promise<void>)[] = [];
	const output = new Output({
		target: new NullTarget(),
		format: new Mp4OutputFormat({
			fastStart: 'fragmented',
			minimumFragmentDuration: opts.fragmentSeconds ?? 4,
			onFtyp: (data) => {
				ftyp = data.slice();
			},
			onMoov: (data) => {
				const init = concat(ftyp!, data);
				pending.push(async () => opts.onInit(init, await output.getMimeType()));
			},
			onMoof: (data, _position, timestamp) => {
				moof = data.slice();
				moofTimestamp = timestamp;
			},
			onMdat: (data) => {
				const segment = concat(moof!, data);
				const timestamp = moofTimestamp;
				pending.push(() => opts.onSegment(segment, timestamp));
			}
		})
	});

	const videoSource = new EncodedVideoPacketSource(tracks.video.codec!);
	output.addVideoTrack(videoSource, { rotation: tracks.video.rotation });

	let audioFeed: AudioFeed | null = null;
	if (tracks.audio && audioAction !== 'none') {
		const audioTrack = tracks.audio;
		if (audioAction === 'copy') {
			const aSource = new EncodedAudioPacketSource(audioTrack.codec!);
			output.addAudioTrack(aSource);
			const aSink = new EncodedPacketSink(audioTrack);
			const first = (await aSink.getPacket(key.timestamp)) ?? (await aSink.getFirstPacket());
			const iter = first ? aSink.packets(first) : null;
			const decoderConfig = await audioTrack.getDecoderConfig();
			let firstAdd = true;
			let next: EncodedPacket | null = iter ? ((await iter.next()).value ?? null) : null;
			audioFeed = {
				peek: () => next?.timestamp ?? null,
				add: async () => {
					if (!next || !iter) return;
					await aSource.add(next, firstAdd && decoderConfig ? { decoderConfig } : undefined);
					firstAdd = false;
					next = (await iter.next()).value ?? null;
				}
			};
		} else {
			const aSource = new AudioSampleSource({
				codec: audioAction,
				quality: QUALITY_HIGH
			});
			output.addAudioTrack(aSource);
			const aSink = new AudioSampleSink(audioTrack);
			const iter = aSink.samples(key.timestamp);
			// AC-3 / E-AC-3 say how they want to be mixed down; ffmpeg's transcode obeys it.
			const firstPacket =
				audioTrack.codec === 'ac3' || audioTrack.codec === 'eac3'
					? await new EncodedPacketSink(audioTrack).getFirstPacket()
					: null;
			const levels = (firstPacket && ac3MixLevels(firstPacket.data)) ?? undefined;
			const surround = opts.audioChannels === 6 && audioTrack.numberOfChannels === 6;
			let next: AudioSample | null = (await iter.next()).value ?? null;
			audioFeed = {
				peek: () => next?.timestamp ?? null,
				add: async () => {
					if (!next) return;
					const sample = next;
					// 5.1 goes to the encoder as decoded; anything else is mixed to stereo.
					const out =
						surround || sample.numberOfChannels === 2 ? sample : downmixToStereo(sample, levels);
					await aSource.add(out);
					if (out !== sample) out.close();
					sample.close();
					next = (await iter.next()).value ?? null;
				}
			};
		}
	}

	await output.start();

	const decoderConfig = await tracks.video.getDecoderConfig();
	const videoIter = vSink.packets(key);
	let video: EncodedPacket | null = (await videoIter.next()).value ?? null;
	let firstVideo = true;

	const drain = async () => {
		while (pending.length) await pending.shift()!();
	};

	try {
		while (video || audioFeed?.peek() != null) {
			if (signal?.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
			const audioTs = audioFeed?.peek() ?? null;
			const takeVideo = video && (audioTs === null || video.timestamp <= audioTs);
			if (takeVideo) {
				await opts.waitForRoom?.(video!.timestamp);
				await videoSource.add(video!, firstVideo && decoderConfig ? { decoderConfig } : undefined);
				firstVideo = false;
				video = (await videoIter.next()).value ?? null;
			} else {
				await audioFeed!.add();
			}
			await drain();
		}
		await output.finalize();
		await drain();
	} catch (err) {
		await output.cancel().catch(() => {});
		throw err;
	}
	return { keyTimestamp: key.timestamp, mimeType };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}
