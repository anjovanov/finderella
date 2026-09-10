import { count, eq } from 'drizzle-orm';
import { isRegistrationOpen } from '$lib/auth-roles';
import { db } from '$lib/server/db';
import { siteSettings, user, type SiteSettingsRow } from '$lib/server/db/schema';

const SETTINGS_ID = 'default';

export type SiteSettings = Pick<SiteSettingsRow, 'allowRegistration' | 'updatedAt'>;

/** The singleton settings row, created with defaults the first time it is read. */
export async function getSiteSettings(): Promise<SiteSettings> {
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

export async function updateSiteSettings(
	patch: Partial<Pick<SiteSettingsRow, 'allowRegistration'>>
): Promise<SiteSettings> {
	await getSiteSettings();
	const [updated] = await db
		.update(siteSettings)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(siteSettings.id, SETTINGS_ID))
		.returning();
	return updated;
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
