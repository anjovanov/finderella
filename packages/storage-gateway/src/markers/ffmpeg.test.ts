import { describe, expect, it } from 'vitest';
import { darkframeArgs, pcmArgs } from './ffmpeg.js';
import { SAMPLE_RATE } from './fingerprint.js';

function valueAfter(args: string[], flag: string): string | undefined {
	const i = args.indexOf(flag);
	return i === -1 ? undefined : args[i + 1];
}

describe('pcmArgs', () => {
	it('seeks on the input and decodes mono PCM at the fingerprint rate', () => {
		const args = pcmArgs({ absPath: '/m/a.mkv', startMs: 1500, durationMs: 600_000 });
		expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
		expect(args.indexOf('-t')).toBeLessThan(args.indexOf('-i'));
		expect(valueAfter(args, '-ss')).toBe('1.500');
		expect(valueAfter(args, '-t')).toBe('600.000');
		expect(valueAfter(args, '-map')).toBe('0:a:0');
		expect(valueAfter(args, '-ac')).toBe('1');
		expect(valueAfter(args, '-ar')).toBe(String(SAMPLE_RATE));
		expect(valueAfter(args, '-f')).toBe('f32le');
		expect(args.at(-1)).toBe('pipe:1');
	});

	it('maps an explicit stream by absolute index', () => {
		const args = pcmArgs({ absPath: '/m/a.mkv', streamIndex: 3, startMs: 0, durationMs: 1000 });
		expect(valueAfter(args, '-map')).toBe('0:3');
	});
});

describe('darkframeArgs', () => {
	it('decodes keyframes of the window and prints pblack to stdout', () => {
		const args = darkframeArgs({ absPath: '/m/a.mkv', startMs: 2_400_000, durationMs: 360_000 });
		expect(args.indexOf('-skip_frame')).toBeLessThan(args.indexOf('-i'));
		expect(valueAfter(args, '-skip_frame')).toBe('nokey');
		expect(valueAfter(args, '-ss')).toBe('2400.000');
		expect(valueAfter(args, '-map')).toBe('0:v:0');
		expect(valueAfter(args, '-vf')).toContain(
			'extractplanes=y,scale=160:-2:flags=area,blackframe=amount=0:threshold=20'
		);
		expect(valueAfter(args, '-vf')).toContain(
			'metadata=mode=print:key=lavfi.blackframe.pblack:file=-'
		);
		expect(valueAfter(args, '-f')).toBe('null');
	});
});
