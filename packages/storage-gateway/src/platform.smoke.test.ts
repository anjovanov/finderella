/**
 * Cross-platform smoke test: runs every ffmpeg argv the gateway builds
 * through the ffmpeg/ffprobe this OS resolves, on a generated clip. Skipped
 * unless FINDERELLA_SMOKE=1 (CI runs it on Linux, macOS and Windows);
 * FINDERELLA_SMOKE_BUNDLED=1 forces the bundled static binaries instead of
 * whatever `detectTools` would pick. FINDERELLA_SMOKE_EXPECT_FFMPEG=system|bundled
 * asserts which build `detectTools` picks (CI's distro jobs: Arch's full ffmpeg
 * must win, Fedora's `ffmpeg-free` must lose to the bundled build).
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { transcodeDir } from './config.js';
import { parseBlackframeOutput } from './markers/darkframes.js';
import { darkframeArgs, pcmArgs } from './markers/ffmpeg.js';
import { SAMPLE_RATE } from './markers/fingerprint.js';
import { detectTools, ffmpegPath, probeFile, probeTrickplaySource } from './probe.js';
import { ensureSubtitleVtt } from './subtitles/extract.js';
import { sheetComplete } from './trickplay/cache.js';
import { sheetFileName, trickplayArgs } from './trickplay/ffmpeg.js';
import { computeGeometry } from './trickplay/geometry.js';
import { parseInitTimescales } from './transcode/mp4-patch.js';
import { sweepTranscodeScratch, TranscodeSession } from './transcode/session.js';

const execFileAsync = promisify(execFile);
const enabled = process.env.FINDERELLA_SMOKE === '1';
const CLIP_SECONDS = 20;

let work: string;
let clip: string;
let ffmpeg: string;

/**
 * Decode time (seconds) of the first track fragment in a segment: the tfhd's
 * track id picks the timescale, the tfdt (v0 32-bit / v1 64-bit) the time.
 */
function firstTfdtSeconds(segment: Buffer, timescales: Map<number, number>): number {
	const tfhd = segment.indexOf('tfhd');
	const tfdt = segment.indexOf('tfdt');
	expect(tfhd).toBeGreaterThan(0);
	expect(tfdt).toBeGreaterThan(0);
	const trackId = segment.readUInt32BE(tfhd + 8);
	const version = segment[tfdt + 4];
	const time =
		version === 1 ? Number(segment.readBigUInt64BE(tfdt + 8)) : segment.readUInt32BE(tfdt + 8);
	const timescale = timescales.get(trackId);
	expect(timescale).toBeDefined();
	return time / timescale!;
}

async function run(args: string[]): Promise<{ stdout: Buffer }> {
	return execFileAsync(ffmpeg, args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
}

describe.skipIf(!enabled)('platform smoke', () => {
	beforeAll(async () => {
		work = await mkdtemp(join(tmpdir(), 'finderella-smoke-'));
		// Keep caches and transcode scratch inside the temp folder.
		process.env.XDG_CACHE_HOME = join(work, 'cache');
		if (process.env.FINDERELLA_SMOKE_BUNDLED === '1') {
			process.env.FFMPEG_PATH = (await import('ffmpeg-static')).default as unknown as string;
			process.env.FFPROBE_PATH = (
				(await import('@ffprobe-installer/ffprobe')).default as { path: string }
			).path;
		}
		const tools = await detectTools();
		for (const note of tools.notes) console.log(`[smoke] ${note}`);
		const expected = process.env.FINDERELLA_SMOKE_EXPECT_FFMPEG;
		if (expected) {
			expect(tools.notes.some((note) => note.startsWith(`using ${expected} ffmpeg`))).toBe(true);
			// Picking the bundled build only proves something when a system one was there to reject.
			if (expected === 'bundled') {
				expect(tools.notes.some((note) => /^system ffmpeg .* skipped: missing /.test(note))).toBe(
					true
				);
			}
		}
		expect(tools.capabilities.ffmpeg).toBe(true);
		expect(tools.ffprobe).toBe(true);
		ffmpeg = ffmpegPath()!;

		const srt = join(work, 'subs.srt');
		await writeFile(srt, '1\n00:00:01,000 --> 00:00:03,000\nHello from the smoke test\n');
		clip = join(work, 'clip with spaces.mkv');
		await run([
			'-hide_banner',
			'-loglevel',
			'error',
			'-f',
			'lavfi',
			'-i',
			`testsrc2=size=640x360:rate=25:duration=${CLIP_SECONDS}`,
			'-f',
			'lavfi',
			'-i',
			`sine=frequency=440:duration=${CLIP_SECONDS}`,
			'-i',
			srt,
			'-map',
			'0',
			'-map',
			'1',
			'-map',
			'2',
			'-c:v',
			'libx264',
			'-pix_fmt',
			'yuv420p',
			'-g',
			'50',
			'-c:a',
			'aac',
			'-c:s',
			'srt',
			clip
		]);
	}, 120_000);

	afterAll(async () => {
		if (work) await rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	});

	it('probes the clip', async () => {
		const probed = await probeFile(clip);
		expect(probed.videoCodec).toBe('h264');
		expect(probed.audioCodec).toBe('aac');
		expect(probed.width).toBe(640);
		expect(probed.durationMs).toBeGreaterThan((CLIP_SECONDS - 1) * 1000);
		expect(probed.subtitles).toHaveLength(1);
		expect(probed.audioTracks).toHaveLength(1);
	});

	it('transcodes to HLS, restarts on a seek and patches tfdt', async () => {
		const session = new TranscodeSession({
			sessionId: 'smoke-session',
			absPath: clip,
			segmentSeconds: 4,
			durationMs: CLIP_SECONDS * 1000,
			quality: { maxWidth: 640, audioKbps: 128, level: '4.1' },
			ffmpegBin: ffmpeg,
			log: (message) => console.log(`[smoke] ${message}`),
			onReap: () => {}
		});
		expect(session.dir.startsWith(transcodeDir())).toBe(true);
		try {
			await session.start(3);
			const init = await readFile(await session.ensureAsset('init.mp4'));
			const seg3 = await readFile(await session.ensureAsset('seg-3.m4s'));
			// A mid-file segment must sit at its absolute time (12 s). Read from the
			// boxes, not with ffprobe: ffprobe before 5.x ignores tfdt.
			expect(firstTfdtSeconds(seg3, parseInitTimescales(init))).toBeCloseTo(12, 0);
			// Behind the window → seek-restart at segment 0.
			const seg0 = await session.ensureAsset('seg-0.m4s');
			expect((await stat(seg0)).size).toBeGreaterThan(0);
		} finally {
			await session.stop();
		}
		await expect(stat(session.dir)).rejects.toThrow();
	}, 120_000);

	it('renders a trickplay sheet', async () => {
		const src = await probeTrickplaySource(clip);
		expect(src).not.toBeNull();
		const geometry = computeGeometry(src!, src!.durationMs);
		const dir = join(work, 'trickplay');
		await mkdir(dir, { recursive: true });
		await run(trickplayArgs({ absPath: clip, dir, geometry }));
		expect(await sheetComplete(join(dir, sheetFileName(0)))).toBe(true);
	}, 120_000);

	it('runs dark-frame analysis', async () => {
		const { stdout } = await run(darkframeArgs({ absPath: clip, startMs: 0, durationMs: 10_000 }));
		const series = parseBlackframeOutput(stdout.toString('utf8'), 0);
		expect(series.timesMs.length).toBeGreaterThan(0);
	}, 120_000);

	it('decodes fingerprint PCM', async () => {
		const { stdout } = await run(pcmArgs({ absPath: clip, startMs: 2_000, durationMs: 5_000 }));
		const expected = 5 * SAMPLE_RATE * 4;
		expect(Math.abs(stdout.byteLength - expected)).toBeLessThan(expected * 0.02);
	}, 120_000);

	it('extracts an embedded subtitle to WebVTT', async () => {
		const handle = await ensureSubtitleVtt(
			{ absVideoPath: clip, source: 'embedded', streamIndex: 2 },
			{ ffmpegBin: ffmpeg, log: () => {} }
		);
		const vtt = await readFile(await handle.done, 'utf8');
		expect(vtt.startsWith('WEBVTT')).toBe(true);
		expect(vtt).toContain('Hello from the smoke test');
	}, 120_000);

	it('sweeps stale transcode folders at startup', async () => {
		const stale = join(transcodeDir(), 'crashed-session');
		const fresh = join(transcodeDir(), 'live-session');
		await mkdir(stale, { recursive: true });
		await mkdir(fresh, { recursive: true });
		await writeFile(join(stale, 'seg-0.m4s'), 'x');
		const hourAgo = new Date(Date.now() - 60 * 60_000);
		await utimes(stale, hourAgo, hourAgo);
		await sweepTranscodeScratch([{ dir: transcodeDir(), maxAgeMs: 10 * 60_000 }]);
		const left = await readdir(transcodeDir());
		expect(left).toContain('live-session');
		expect(left).not.toContain('crashed-session');
	});
});
