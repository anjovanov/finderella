import { fail } from '@sveltejs/kit';
import { getPreferences, PreferencesPatch, savePreferences } from '$lib/server/user-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	preferences: await getPreferences(locals.user!.id)
});

/** The string fields a form posted (missing ones stay undefined, so they're left alone). */
function fields(formData: FormData, names: string[]): Record<string, string> {
	return Object.fromEntries(
		names.flatMap((name) => {
			const value = formData.get(name);
			return typeof value === 'string' ? [[name, value]] : [];
		})
	);
}

// Two forms, two actions: saving one card never resets the other.
export const actions: Actions = {
	updateAppearance: async (event) => {
		const parsed = PreferencesPatch.pick({ theme: true }).safeParse(
			fields(await event.request.formData(), ['theme'])
		);
		if (!parsed.success) return fail(400, { section: 'appearance', message: 'Pick a theme' });
		await savePreferences(event.locals.user!.id, parsed.data);
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
		await savePreferences(event.locals.user!.id, parsed.data);
		return { section: 'screensaver', saved: true };
	}
};
