import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './user-agent';

const UA = {
	chromeWindows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
	edgeWindows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.2739.42',
	firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
	safariMac:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
	safariIphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
	chromeIos:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1',
	ipad: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
	androidPhone:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
	androidTablet:
		'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
	samsungPhone:
		'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
	tizenTv:
		'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36',
	webOsTv:
		'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager',
	chromebook:
		'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
	opera:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/113.0.0.0'
};

describe('parseUserAgent', () => {
	it('tells desktop browsers apart (brands before Chrome)', () => {
		expect(parseUserAgent(UA.chromeWindows)).toEqual({
			browser: 'Chrome',
			browserVersion: '128',
			os: 'Windows',
			deviceType: 'desktop'
		});
		expect(parseUserAgent(UA.edgeWindows)).toMatchObject({
			browser: 'Edge',
			browserVersion: '128'
		});
		expect(parseUserAgent(UA.opera)).toMatchObject({ browser: 'Opera', os: 'Windows' });
		expect(parseUserAgent(UA.firefoxLinux)).toMatchObject({
			browser: 'Firefox',
			browserVersion: '130',
			os: 'Linux',
			deviceType: 'desktop'
		});
		expect(parseUserAgent(UA.safariMac)).toMatchObject({
			browser: 'Safari',
			browserVersion: '17',
			os: 'macOS'
		});
		expect(parseUserAgent(UA.chromebook)).toMatchObject({ browser: 'Chrome', os: 'ChromeOS' });
	});

	it('detects phones and tablets', () => {
		expect(parseUserAgent(UA.safariIphone)).toMatchObject({
			browser: 'Safari',
			os: 'iOS',
			deviceType: 'mobile'
		});
		expect(parseUserAgent(UA.chromeIos)).toMatchObject({ browser: 'Chrome', os: 'iOS' });
		expect(parseUserAgent(UA.ipad)).toMatchObject({ os: 'iPadOS', deviceType: 'tablet' });
		expect(parseUserAgent(UA.androidPhone)).toMatchObject({ os: 'Android', deviceType: 'mobile' });
		expect(parseUserAgent(UA.androidTablet)).toMatchObject({ os: 'Android', deviceType: 'tablet' });
		expect(parseUserAgent(UA.samsungPhone)).toMatchObject({
			browser: 'Samsung Internet',
			browserVersion: '25',
			deviceType: 'mobile'
		});
	});

	it('detects TVs', () => {
		expect(parseUserAgent(UA.tizenTv)).toMatchObject({ os: 'Tizen', deviceType: 'tv' });
		expect(parseUserAgent(UA.webOsTv)).toMatchObject({ os: 'webOS', deviceType: 'tv' });
	});

	it('handles a missing or unknown header', () => {
		expect(parseUserAgent(null)).toEqual({
			browser: null,
			browserVersion: null,
			os: null,
			deviceType: 'unknown'
		});
		expect(parseUserAgent('curl/8.9.1')).toMatchObject({ browser: null, deviceType: 'unknown' });
	});
});
