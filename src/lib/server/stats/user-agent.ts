import type { DeviceType } from '$lib/data/stats';

export interface ParsedUserAgent {
	browser: string | null;
	browserVersion: string | null;
	os: string | null;
	deviceType: DeviceType;
}

/** Ordered: brands that embed "Chrome"/"Safari" in their UA must be tested first. */
const BROWSERS: [name: string, re: RegExp][] = [
	['Edge', /\bEdg(?:e|A|iOS)?\/([\d.]+)/],
	['Opera', /\b(?:OPR|Opera)\/([\d.]+)/],
	['Samsung Internet', /\bSamsungBrowser\/([\d.]+)/],
	['Vivaldi', /\bVivaldi\/([\d.]+)/],
	['Yandex', /\bYaBrowser\/([\d.]+)/],
	['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
	['Chrome', /\b(?:Chrome|CriOS)\/([\d.]+)/],
	['Safari', /\bVersion\/([\d.]+).*\bSafari\//]
];

const TV =
	/\b(?:SMART-TV|SmartTV|Tizen|Web0S|webOS|NetCast|BRAVIA|HbbTV|CrKey|AFT[A-Z]|Android TV|GoogleTV|AppleTV|tvOS)\b/i;

function detectOs(ua: string): string | null {
	if (/\bTizen\b/.test(ua)) return 'Tizen';
	if (/\b(?:Web0S|webOS)\b/.test(ua)) return 'webOS';
	if (/\bCrKey\b/.test(ua)) return 'Chromecast';
	if (/\bWindows Phone\b/.test(ua)) return 'Windows Phone';
	if (/\bWindows\b/.test(ua)) return 'Windows';
	if (/\biPad\b/.test(ua)) return 'iPadOS';
	if (/\b(?:iPhone|iPod)\b/.test(ua)) return 'iOS';
	if (/\bAndroid\b/.test(ua)) return 'Android';
	if (/\bCrOS\b/.test(ua)) return 'ChromeOS';
	// iPadOS 13+ Safari reports itself as a Mac; indistinguishable server-side.
	if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return 'macOS';
	if (/\bLinux\b|\bX11\b/.test(ua)) return 'Linux';
	return null;
}

function detectDevice(ua: string, os: string | null): DeviceType {
	if (TV.test(ua)) return 'tv';
	if (os === 'iPadOS' || /\bTablet\b/i.test(ua)) return 'tablet';
	// Android tablets drop the "Mobile" token from their UA.
	if (os === 'Android') return /\bMobile\b/.test(ua) ? 'mobile' : 'tablet';
	if (os === 'iOS' || os === 'Windows Phone' || /\bMobile\b/.test(ua)) return 'mobile';
	if (os) return 'desktop';
	return 'unknown';
}

/** Browser / OS / form factor from a User-Agent header (best effort, no dependency). */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
	if (!ua) return { browser: null, browserVersion: null, os: null, deviceType: 'unknown' };
	let browser: string | null = null;
	let browserVersion: string | null = null;
	for (const [name, re] of BROWSERS) {
		const match = re.exec(ua);
		if (match) {
			browser = name;
			// Major version only — minor/build numbers are noise in a stats table.
			browserVersion = match[1].split('.')[0];
			break;
		}
	}
	const os = detectOs(ua);
	return { browser, browserVersion, os, deviceType: detectDevice(ua, os) };
}
