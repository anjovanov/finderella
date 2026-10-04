import { count, eq } from 'drizzle-orm';
import { isRegistrationOpen } from '$lib/auth-roles';
import { normalizeBranding, type Branding } from '$lib/data/branding';
import { db } from '$lib/server/db';
import { siteSettings, user, type SiteSettingsRow } from '$lib/server/db/schema';

const SETTINGS_ID = 'default';

export type SiteSettings = Pick<
	SiteSettingsRow,
	| 'allowRegistration'
	| 'requireLogin'
	| 'trickplayEnabled'
	| 'markersEnabled'
	| 'remuxEnabled'
	| 'maxSessionsPerAccount'
	| 'maxProfilesPerAccount'
	| 'appName'
	| 'tagline'
	| 'accent'
	| 'bodyFont'
	| 'headingFont'
	| 'updatedAt'
>;
type SiteSettingsPatch = Partial<
	Pick<
		SiteSettingsRow,
		| 'allowRegistration'
		| 'requireLogin'
		| 'trickplayEnabled'
		| 'markersEnabled'
		| 'remuxEnabled'
		| 'maxSessionsPerAccount'
		| 'maxProfilesPerAccount'
		| 'appName'
		| 'tagline'
		| 'accent'
		| 'bodyFont'
		| 'headingFont'
	>
>;

// hooks.server.ts consults the settings on every unauthenticated request; the
// hub is single-process, so a short in-memory cache (cleared on update) is safe.
const CACHE_TTL_MS = 5_000;
let cached: { value: SiteSettings; expiresAt: number } | null = null;

/** The singleton settings row, created with defaults the first time it is read. */
export async function getSiteSettings(): Promise<SiteSettings> {
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	const value = await readSiteSettings();
	cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
	return value;
}

async function readSiteSettings(): Promise<SiteSettings> {
	const existing = await db.query.siteSettings.findFirst({
		where: eq(siteSettings.id, SETTINGS_ID)
	});
	if (existing) return existing;
	await db.insert(siteSettings).values({ id: SETTINGS_ID }).onConflictDoNothing();
	const created = await db.query.siteSettings.findFirst({
		where: eq(siteSettings.id, SETTINGS_ID)
	});
	if (!created) throw new Error('site_settings row could not be created');
	return created;
}

export async function updateSiteSettings(patch: SiteSettingsPatch): Promise<SiteSettings> {
	await getSiteSettings();
	cached = null;
	const [updated] = await db
		.update(siteSettings)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(siteSettings.id, SETTINGS_ID))
		.returning();
	cached = { value: updated, expiresAt: Date.now() + CACHE_TTL_MS };
	return updated;
}

/** true = every page outside login/register needs a session (the default). */
export async function loginRequired(): Promise<boolean> {
	return (await getSiteSettings()).requireLogin;
}

/** Admin switch for seek-bar thumbnails (devices can also opt out with FINDERELLA_TRICKPLAY=0). */
export async function trickplayEnabled(): Promise<boolean> {
	return (await getSiteSettings()).trickplayEnabled;
}

/** Admin switch for Skip intro / Skip credits (devices can opt out of analysis with FINDERELLA_MARKERS=0). */
export async function markersEnabled(): Promise<boolean> {
	return (await getSiteSettings()).markersEnabled;
}

/** Admin switch for in-browser remux; off = everything the browser can't open directly transcodes. */
export async function remuxEnabled(): Promise<boolean> {
	return (await getSiteSettings()).remuxEnabled;
}

/** Signed-in devices allowed per account; null = unlimited. */
export async function sessionLimit(): Promise<number | null> {
	return (await getSiteSettings()).maxSessionsPerAccount;
}

/** Profiles allowed per account; null = unlimited. */
export async function profileLimit(): Promise<number | null> {
	return (await getSiteSettings()).maxProfilesPerAccount;
}

/** The hub's name, tagline, accent and fonts (every page reads them). */
export async function getBranding(): Promise<Branding> {
	return normalizeBranding(await getSiteSettings());
}

export async function countUsers(): Promise<number> {
	const [row] = await db.select({ n: count() }).from(user);
	return row?.n ?? 0;
}

export interface RegistrationStatus {
	userCount: number;
	/** No account exists yet: the next sign-up becomes the administrator. */
	firstUser: boolean;
	open: boolean;
}

export async function registrationStatus(): Promise<RegistrationStatus> {
	const [userCount, settings] = await Promise.all([countUsers(), getSiteSettings()]);
	return {
		userCount,
		firstUser: userCount === 0,
		open: isRegistrationOpen({ userCount, allowRegistration: settings.allowRegistration })
	};
}

export async function registrationOpen(): Promise<boolean> {
	return (await registrationStatus()).open;
}
