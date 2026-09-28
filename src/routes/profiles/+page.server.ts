import { fail, redirect } from '@sveltejs/kit';
import { MAX_PROFILES, safeRedirectPath } from '$lib/data/profiles';
import {
	createProfile,
	deleteProfile,
	getProfile,
	ProfileError,
	ProfileInput,
	updateProfile
} from '$lib/server/profiles';
import { setActiveProfile } from '$lib/server/active-profile';
import type { Actions, PageServerLoad } from './$types';

/**
 * "Who's watching?" + profile management. hooks.server.ts sends signed-in
 * accounts here while none of their profiles is active on this sign-in; the
 * navbar's switcher posts to `?/select` from any page, and its "Manage
 * profiles" opens the page in manage mode (`?manage`).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	// /profiles is in ACCOUNT_PREFIXES: a session is guaranteed.
	const profiles = locals.profiles ?? [];
	return {
		profiles,
		activeId: locals.profile?.id ?? null,
		maxProfiles: MAX_PROFILES,
		manage: url.searchParams.has('manage'),
		redirectTo: safeRedirectPath(url.searchParams.get('redirectTo'))
	};
};

function parseInput(form: FormData) {
	const parsed = ProfileInput.safeParse({
		name: form.get('name') ?? '',
		avatarColor: form.get('avatarColor') ?? '',
		avatarIcon: form.get('avatarIcon') ?? ''
	});
	if (parsed.success) return { data: parsed.data } as const;
	return { message: parsed.error.issues[0]?.message ?? 'Check the form and try again.' } as const;
}

/** ProfileError → a readable 400 for the dialog; anything else propagates as a 500. */
async function run(fn: () => Promise<unknown>) {
	try {
		await fn();
		return { saved: true };
	} catch (err) {
		if (err instanceof ProfileError) return fail(400, { message: err.message });
		throw err;
	}
}

export const actions: Actions = {
	select: async ({ request, locals }) => {
		const form = await request.formData();
		const id = form.get('profileId');
		const profile = typeof id === 'string' ? await getProfile(locals.user!.id, id) : null;
		if (!profile) return fail(400, { message: 'That profile no longer exists.' });
		await setActiveProfile(locals.session!.token, profile.id);
		redirect(303, safeRedirectPath(form.get('redirectTo')));
	},

	create: async ({ request, locals }) => {
		const input = parseInput(await request.formData());
		if (!input.data) return fail(400, { message: input.message });
		return run(() => createProfile(locals.user!.id, input.data));
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = form.get('profileId');
		if (typeof id !== 'string') return fail(400, { message: 'That profile no longer exists.' });
		const input = parseInput(form);
		if (!input.data) return fail(400, { message: input.message });
		return run(() => updateProfile(locals.user!.id, id, input.data));
	},

	delete: async ({ request, locals }) => {
		const id = (await request.formData()).get('profileId');
		if (typeof id !== 'string') return fail(400, { message: 'That profile no longer exists.' });
		return run(() => deleteProfile(locals.user!.id, id));
	}
};
