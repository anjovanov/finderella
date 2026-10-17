import { describe, expect, it } from 'vitest';
import { isAbsoluteLibraryPath, libraryNameFromPath } from './library-path';

describe('isAbsoluteLibraryPath', () => {
	it('accepts POSIX, drive and UNC paths', () => {
		expect(isAbsoluteLibraryPath('/mnt/media/Movies')).toBe(true);
		expect(isAbsoluteLibraryPath('/')).toBe(true);
		expect(isAbsoluteLibraryPath('D:\\Movies')).toBe(true);
		expect(isAbsoluteLibraryPath('E:\\')).toBe(true);
		expect(isAbsoluteLibraryPath('d:/Movies')).toBe(true);
		expect(isAbsoluteLibraryPath('\\\\nas\\media')).toBe(true);
	});

	it('refuses relative and drive-relative paths', () => {
		expect(isAbsoluteLibraryPath('Movies')).toBe(false);
		expect(isAbsoluteLibraryPath('./Movies')).toBe(false);
		expect(isAbsoluteLibraryPath('~/Movies')).toBe(false);
		expect(isAbsoluteLibraryPath('D:Movies')).toBe(false);
		expect(isAbsoluteLibraryPath('\\\\nas')).toBe(false);
	});
});

describe('libraryNameFromPath', () => {
	it('takes the last folder on any OS', () => {
		expect(libraryNameFromPath('/mnt/media/Movies/')).toBe('Movies');
		expect(libraryNameFromPath('D:\\Media\\Series')).toBe('Series');
		expect(libraryNameFromPath('\\\\nas\\media')).toBe('media');
		expect(libraryNameFromPath('E:\\')).toBe('E:');
		expect(libraryNameFromPath('/')).toBe('/');
	});
});
