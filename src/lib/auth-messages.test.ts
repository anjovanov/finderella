import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-messages';

describe('authErrorMessage', () => {
	it('words the Better Auth codes the forms meet', () => {
		expect(authErrorMessage('INVALID_EMAIL_OR_PASSWORD', 'sign-in')).toBe(
			'Wrong email or password.'
		);
		expect(authErrorMessage('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 'sign-up')).toBe(
			'An account with that email already exists.'
		);
		expect(authErrorMessage('REGISTRATION_CLOSED', 'sign-up')).toBe(
			'Registration is closed on this server.'
		);
	});

	it('falls back per form for anything else', () => {
		expect(authErrorMessage(undefined, 'sign-in')).toBe('Sign in failed. Try again.');
		expect(authErrorMessage('SOMETHING_NEW', 'sign-up')).toBe('Sign up failed. Try again.');
		expect(authErrorMessage(undefined, 'account')).toBe('Your changes weren’t saved. Try again.');
	});
});
