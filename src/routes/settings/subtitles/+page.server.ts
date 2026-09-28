import { fail } from '@sveltejs/kit';
import {
	getSubtitleSettings,
	saveSubtitleSettings,
	SubtitleSettingsPatch
} from '$lib/server/profile-settings';
import type { Actions, PageServerLoad } from './$types';
import { requireProfile } from '$lib/server/profiles';

export const load: PageServerLoad = async ({ locals }) => ({
	subtitleSettings: await getSubtitleSettings(requireProfile(locals).id)
});

export const actions: Actions = {
	updateSubtitles: async (event) => {
		const formData = await event.request.formData();
		const fields = ['language', 'size', 'color', 'background', 'position', 'font'] as const;
		const raw = Object.fromEntries(
			fields.flatMap((field) => {
				const value = formData.get(field);
				return typeof value === 'string' ? [[field, value]] : [];
			})
		);
		const parsed = SubtitleSettingsPatch.safeParse(raw);
		if (!parsed.success) return fail(400, { message: 'Pick a value from each list' });
		await saveSubtitleSettings(requireProfile(event.locals).id, parsed.data);
		return { saved: true };
	}
};
