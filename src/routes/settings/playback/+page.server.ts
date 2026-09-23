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

/** The string fields a form posted (missing ones — e.g. disabled selects — stay untouched). */
function fields(formData: FormData, names: string[]): Record<string, string> {
	return Object.fromEntries(
		names.flatMap((name) => {
			const value = formData.get(name);
			return typeof value === 'string' ? [[name, value]] : [];
		})
	);
}

// One form per card, one action per form: saving one card never resets another.
export const actions: Actions = {
	updatePlayback: async (event) => {
		const parsed = PlaybackSettingsPatch.pick({
			audioLanguage: true,
			audioChannels: true
		}).safeParse(fields(await event.request.formData(), ['audioLanguage', 'audioChannels']));
		if (!parsed.success) {
			return fail(400, { section: 'audio', message: 'Pick a value from each list' });
		}
		await savePlaybackSettings(event.locals.user!.id, parsed.data);
		return { section: 'audio', saved: true };
	},

	updateAutoplay: async (event) => {
		const parsed = PlaybackSettingsPatch.pick({ autoplayNext: true }).safeParse(
			fields(await event.request.formData(), ['autoplayNext'])
		);
		if (!parsed.success) return fail(400, { section: 'autoplay', message: 'Invalid value' });
		await savePlaybackSettings(event.locals.user!.id, parsed.data);
		return { section: 'autoplay', saved: true };
	},

	updateStillWatching: async (event) => {
		const parsed = PlaybackSettingsPatch.pick({
			stillWatchingEnabled: true,
			stillWatchingEpisodes: true,
			stillWatchingMinutes: true
		}).safeParse(
			fields(await event.request.formData(), [
				'stillWatchingEnabled',
				'stillWatchingEpisodes',
				'stillWatchingMinutes'
			])
		);
		if (!parsed.success) {
			return fail(400, { section: 'stillWatching', message: 'Pick a value from each list' });
		}
		await savePlaybackSettings(event.locals.user!.id, parsed.data);
		return { section: 'stillWatching', saved: true };
	}
};
