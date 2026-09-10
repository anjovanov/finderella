/**
 * Role helpers shared by server code and the UI. Better Auth's admin plugin
 * stores roles as a comma-separated string on `user.role`.
 */
export const ADMIN_ROLE = 'admin';
export const USER_ROLE = 'user';

export function hasRole(role: string | null | undefined, wanted: string): boolean {
	return (role ?? '')
		.split(',')
		.map((r) => r.trim())
		.includes(wanted);
}

export function isAdmin(user: { role?: string | null } | null | undefined): boolean {
	return !!user && hasRole(user.role, ADMIN_ROLE);
}

/** Role for a freshly created user: the first account on an empty hub is the admin. */
export function roleForNewUser(existingUsers: number, requested?: string | null): string {
	return existingUsers === 0 ? ADMIN_ROLE : requested || USER_ROLE;
}

/** Sign-up stays possible while the hub has no users at all, whatever the setting says. */
export function isRegistrationOpen(s: { userCount: number; allowRegistration: boolean }): boolean {
	return s.userCount === 0 || s.allowRegistration;
}
