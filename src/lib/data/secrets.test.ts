import { describe, expect, it } from 'vitest';
import { maskSecret } from './secrets';

describe('maskSecret', () => {
	it('shows only the last four characters', () => {
		expect(maskSecret('abcdef123456')).toBe('••••3456');
		expect(maskSecret('  abcdef123456  ')).toBe('••••3456');
	});

	it('hides short values completely', () => {
		expect(maskSecret('abcd')).toBe('••••');
		expect(maskSecret('ab')).toBe('••••');
	});

	it('returns null when nothing is stored', () => {
		expect(maskSecret(null)).toBeNull();
		expect(maskSecret(undefined)).toBeNull();
		expect(maskSecret('   ')).toBeNull();
	});
});
