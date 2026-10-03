import type { DeviceType } from './stats';

/** One signed-in session of the viewer's account, as /settings/devices shows it. */
export interface AccountSession {
	id: string;
	browser: string | null;
	os: string | null;
	deviceType: DeviceType;
	/** ISO time the session was last used (about 5 minutes' precision). */
	lastActiveAt: string;
	/** The session this request is signed in with. */
	current: boolean;
}

/** "Chrome on Windows", "Unknown browser on Linux", "Unknown device". */
export function sessionDeviceLabel(s: Pick<AccountSession, 'browser' | 'os'>): string {
	if (!s.os) return s.browser ?? 'Unknown device';
	return `${s.browser ?? 'Unknown browser'} on ${s.os}`;
}

/** The current session first, then the most recently used. */
export function sortAccountSessions(list: AccountSession[]): AccountSession[] {
	return [...list].sort(
		(a, b) =>
			Number(b.current) - Number(a.current) ||
			new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
	);
}
