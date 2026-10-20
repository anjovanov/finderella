import { fail } from '@sveltejs/kit';
import { getPreferences, PreferencesPatch, savePreferences } from '$lib/server/profile-settings';
import type { Actions, PageServerLoad } from './$types';
import { requireProfile } from '$lib/server/profiles';
import { defaultLocale } from '$lib/server/site-settings';

export const load: PageServerLoad = async ({ locals }) => {
	const [preferences, siteLocale] = await Promise.all([
		getPreferences(requireProfile(locals).id),
		defaultLocale()
	]);
	return { preferences, siteLocale };
};

/** The string fields a form posted (missing ones stay undefined, so they're left alone). */
function fields(formData: FormData, names: string[]): Record<string, string> {
	return Object.fromEntries(
		names.flatMap((name) => {
			const value = formData.get(name);
			return typeof value === 'string' ? [[name, value]] : [];
		})
	);
}

// One form and action per card: saving one card never resets another.
export const actions: Actions = {
	updateLanguage: async (event) => {
		const parsed = PreferencesPatch.pick({ language: true }).safeParse(
			fields(await event.request.formData(), ['language'])
		);
		if (!parsed.success || parsed.data.language === undefined) {
			return fail(400, { section: 'language', message: 'Pick a language from the list' });
		}
		await savePreferences(requireProfile(event.locals).id, parsed.data);
		return { section: 'language', saved: true };
	},

	updateAppearance: async (event) => {
		const parsed = PreferencesPatch.pick({ theme: true }).safeParse(
			fields(await event.request.formData(), ['theme'])
		);
		if (!parsed.success) return fail(400, { section: 'appearance', message: 'Pick a theme' });
		await savePreferences(requireProfile(event.locals).id, parsed.data);
		return { section: 'appearance', saved: true };
	},

	updateScreensaver: async (event) => {
		const parsed = PreferencesPatch.pick({
			screensaverEnabled: true,
			screensaverKind: true,
			screensaverSeconds: true
		}).safeParse(
			fields(await event.request.formData(), [
				'screensaverEnabled',
				'screensaverKind',
				'screensaverSeconds'
			])
		);
		if (!parsed.success) {
			return fail(400, { section: 'screensaver', message: 'Pick a value from each list' });
		}
		await savePreferences(requireProfile(event.locals).id, parsed.data);
		return { section: 'screensaver', saved: true };
	}
};
