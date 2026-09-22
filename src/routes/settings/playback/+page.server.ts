import { fail } from '@sveltejs/kit';
import {
	getPlaybackSettings,
	PlaybackSettingsPatch,
	savePlaybackSettings
} from '$lib/server/user-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	playbackSettings: await getPlaybackSettings(locals.user!.id)
});

export const actions: Actions = {
	updatePlayback: async (event) => {
		const formData = await event.request.formData();
		const audioLanguage = formData.get('audioLanguage');
		const parsed = PlaybackSettingsPatch.safeParse({
			audioLanguage: typeof audioLanguage === 'string' ? audioLanguage : undefined
		});
		if (!parsed.success) return fail(400, { message: 'Pick a language from the list' });
		await savePlaybackSettings(event.locals.user!.id, parsed.data);
		return { saved: true };
	}
};
