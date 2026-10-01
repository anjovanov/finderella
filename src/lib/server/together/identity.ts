import { error } from '@sveltejs/kit';
import type { ProfileSummary } from '$lib/data/profiles';
import type { TogetherIdentity } from './room';

/** Who a party participant is: the account plus the profile they're watching as. */
export function identityFor(locals: App.Locals, profile: ProfileSummary): TogetherIdentity {
	if (!locals.user) error(401, 'Sign in to continue.');
	return {
		userId: locals.user.id,
		profileId: profile.id,
		name: profile.name,
		avatarColor: profile.avatarColor,
		avatarIcon: profile.avatarIcon
	};
}
