import { describe, expect, it } from 'vitest';
import { availableQualities, resolutionLabel, transcodePlan } from './playback-quality';

describe('availableQualities', () => {
	it('hides rungs above the source resolution, tolerating cropped widths', () => {
		expect(availableQualities(1920).map((o) => o.id)).toEqual([
			'original',
			'1080p',
			'720p',
			'480p',
			'360p'
		]);
		expect(availableQualities(1916).map((o) => o.id)).toContain('1080p');
		expect(availableQualities(3840).map((o) => o.id)).toContain('2160p');
		expect(availableQualities(854).map((o) => o.id)).toEqual(['original', '480p', '360p']);
	});

	it('offers everything when the width is unknown', () => {
		expect(availableQualities(null)).toHaveLength(6);
	});
});

describe('transcodePlan', () => {
	it('keeps level 4.1 for 1080p-class output and uses 5.2 above', () => {
		expect(transcodePlan('original', 1920)).toMatchObject({ level: '4.1', codec: 'avc1.640029' });
		expect(transcodePlan('original', 3840)).toMatchObject({ level: '5.2', codec: 'avc1.640034' });
		// A 2160p rung on a 1080p source never produces >1080p output.
		expect(transcodePlan('2160p', 1920)).toMatchObject({ level: '4.1', maxWidth: 3840 });
		expect(transcodePlan('720p', 3840)).toMatchObject({ level: '4.1', maxWidth: 1280 });
	});

	it('caps bitrate only for explicit rungs', () => {
		expect(transcodePlan('original', 1920).maxVideoKbps).toBeUndefined();
		expect(transcodePlan('480p', 1920)).toMatchObject({ maxVideoKbps: 2000, audioKbps: 128 });
		// Unknown source width assumes the cap (4K-capable level for auto).
		expect(transcodePlan('original', null).level).toBe('5.2');
	});
});

describe('resolutionLabel', () => {
	it('names common widths', () => {
		expect(resolutionLabel(3840)).toBe('2160p');
		expect(resolutionLabel(1920)).toBe('1080p');
		expect(resolutionLabel(1916)).toBe('1080p');
		expect(resolutionLabel(1280)).toBe('720p');
		expect(resolutionLabel(640)).toBe('360p');
	});
});
