import { fail } from '@sveltejs/kit';
import {
	getSubtitleSettings,
	saveSubtitleSettings,
	SubtitleSettingsPatch
} from '$lib/server/user-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	subtitleSettings: await getSubtitleSettings(locals.user!.id)
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
		await saveSubtitleSettings(event.locals.user!.id, parsed.data);
		return { saved: true };
	}
};
