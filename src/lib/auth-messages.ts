/**
 * Better Auth failures in the viewer's language. Its own `message` is English,
 * so the forms word its stable `body.code` instead and fall back to a generic
 * line for anything unexpected. Sign-in / sign-up pages are seen signed out,
 * in the hub's default language; the account form in the profile's.
 */
export function authErrorMessage(code: unknown, action: 'sign-in' | 'sign-up' | 'account'): string {
	switch (code) {
		case 'INVALID_EMAIL_OR_PASSWORD':
			return 'Wrong email or password.';
		case 'INVALID_EMAIL':
			return 'Enter a valid email address.';
		case 'BANNED_USER':
			return 'This account has been suspended. Ask an administrator for help.';
		case 'INVALID_PASSWORD':
			return 'That password is wrong.';
		case 'PASSWORD_TOO_SHORT':
			return 'That password is too short.';
		case 'PASSWORD_TOO_LONG':
			return 'That password is too long.';
		case 'USER_ALREADY_EXISTS':
		case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
			return 'An account with that email already exists.';
		case 'REGISTRATION_CLOSED':
			return 'Registration is closed on this server.';
	}
	if (action === 'sign-in') return 'Sign in failed. Try again.';
	if (action === 'sign-up') return 'Sign up failed. Try again.';
	return 'Your changes weren’t saved. Try again.';
}
