import { error } from '@sveltejs/kit';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { profile } from '$lib/server/db/schema';
import {
	isProfileColor,
	isProfileIcon,
	MAX_PROFILES,
	normalizeAvatar,
	PROFILE_NAME_MAX,
	type ProfileSummary
} from '$lib/data/profiles';

/**
 * Account profiles. Everything a viewer does — progress, watchlist, settings —
 * is keyed by profile id; the account keeps only sign-in data. The active
 * profile of a sign-in is `session.active_profile_id` (a Better Auth session
 * additional field, written by $lib/server/active-profile), resolved per
 * request in hooks.server.ts.
 */

export class ProfileError extends Error {}

export const ProfileInput = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Enter a name.')
		.max(PROFILE_NAME_MAX, `Keep the name under ${PROFILE_NAME_MAX + 1} characters.`),
	avatarColor: z.string().refine(isProfileColor, 'Pick a color.'),
	// '' (the "initial" option in the form) → null.
	avatarIcon: z
		.string()
		.optional()
		.transform((v) => (v ? v : null))
		.refine((v) => v === null || isProfileIcon(v), 'Pick an icon.')
});
export type ProfileInput = z.infer<typeof ProfileInput>;

type ProfileRow = typeof profile.$inferSelect;

function toSummary(row: ProfileRow): ProfileSummary {
	const avatar = normalizeAvatar({ color: row.avatarColor, icon: row.avatarIcon });
	return {
		id: row.id,
		name: row.name,
		avatarColor: avatar.color,
		avatarIcon: avatar.icon,
		isPrimary: row.isPrimary
	};
}

/** The account's profiles, primary first, then in creation order. */
export async function listProfiles(userId: string): Promise<ProfileSummary[]> {
	const rows = await db
		.select()
		.from(profile)
		.where(eq(profile.userId, userId))
		.orderBy(desc(profile.isPrimary), asc(profile.createdAt));
	return rows.map(toSummary);
}

export async function getProfile(userId: string, id: string): Promise<ProfileSummary | null> {
	if (!z.uuid().safeParse(id).success) return null;
	const row = await db.query.profile.findFirst({
		where: and(eq(profile.id, id), eq(profile.userId, userId))
	});
	return row ? toSummary(row) : null;
}

/** Postgres unique violations, looked up through drizzle's wrapped `cause`. */
function isUniqueViolation(err: unknown, constraint: string): boolean {
	for (
		let e = err as { code?: string; constraint_name?: string; cause?: unknown } | undefined;
		e;
	) {
		if (e.code === '23505' && e.constraint_name === constraint) return true;
		e = e.cause as typeof e;
	}
	return false;
}

async function nameTaken(userId: string, name: string, exceptId?: string): Promise<boolean> {
	const row = await db.query.profile.findFirst({
		columns: { id: true },
		where: and(eq(profile.userId, userId), sql`lower(${profile.name}) = lower(${name})`)
	});
	return !!row && row.id !== exceptId;
}

const DUPLICATE_NAME = 'Another profile on this account already has that name.';

export async function createProfile(userId: string, input: ProfileInput): Promise<ProfileSummary> {
	const [{ n }] = await db.select({ n: count() }).from(profile).where(eq(profile.userId, userId));
	if (n >= MAX_PROFILES)
		throw new ProfileError(`An account can have up to ${MAX_PROFILES} profiles.`);
	if (await nameTaken(userId, input.name)) throw new ProfileError(DUPLICATE_NAME);
	try {
		const [row] = await db
			.insert(profile)
			.values({
				userId,
				name: input.name,
				avatarColor: input.avatarColor,
				avatarIcon: input.avatarIcon,
				isPrimary: n === 0
			})
			.returning();
		return toSummary(row);
	} catch (err) {
		if (isUniqueViolation(err, 'profile_user_name')) throw new ProfileError(DUPLICATE_NAME);
		throw err;
	}
}

export async function updateProfile(
	userId: string,
	id: string,
	input: ProfileInput
): Promise<ProfileSummary> {
	const existing = await getProfile(userId, id);
	if (!existing) throw new ProfileError('That profile no longer exists.');
	if (await nameTaken(userId, input.name, id)) throw new ProfileError(DUPLICATE_NAME);
	try {
		const [row] = await db
			.update(profile)
			.set({ name: input.name, avatarColor: input.avatarColor, avatarIcon: input.avatarIcon })
			.where(and(eq(profile.id, id), eq(profile.userId, userId)))
			.returning();
		return toSummary(row);
	} catch (err) {
		if (isUniqueViolation(err, 'profile_user_name')) throw new ProfileError(DUPLICATE_NAME);
		throw err;
	}
}

/**
 * Delete a profile with its progress, watchlist and settings (FK cascade);
 * play history keeps its `profile_name` snapshot. The primary profile stays.
 * Sessions still pointing at it fall back to the picker on their next request
 * (hooks.server.ts ignores an active id the account no longer owns).
 */
export async function deleteProfile(userId: string, id: string): Promise<void> {
	const existing = await getProfile(userId, id);
	if (!existing) throw new ProfileError('That profile no longer exists.');
	if (existing.isPrimary) throw new ProfileError("The account's main profile can't be deleted.");
	await db.delete(profile).where(and(eq(profile.id, id), eq(profile.userId, userId)));
}

/**
 * Give an account its primary profile when it has none: Better Auth's
 * user.create.after hook (sign-up, admin-created users), and hooks.server.ts
 * as a self-heal for an account that somehow has no profile at all.
 */
export async function ensurePrimaryProfile(userId: string, name: string): Promise<void> {
	const existing = await db.query.profile.findFirst({
		columns: { id: true },
		where: eq(profile.userId, userId)
	});
	if (existing) return;
	const trimmed = name.trim().slice(0, PROFILE_NAME_MAX) || 'Profile';
	await db.insert(profile).values({ userId, name: trimmed, isPrimary: true }).onConflictDoNothing();
}

/** The profile whose data a request reads; null for guests and sign-ins that haven't picked one. */
export function viewerProfileId(locals: App.Locals): string | null {
	return locals.profile?.id ?? null;
}

/** For writes that belong to a profile: 401 for guests, 409 before a profile is picked. */
export function requireProfile(locals: App.Locals): ProfileSummary {
	if (!locals.user) error(401, 'Sign in to continue.');
	if (!locals.profile) error(409, 'Choose a profile first.');
	return locals.profile;
}
