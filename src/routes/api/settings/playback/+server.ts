import { error, json, type RequestHandler } from '@sveltejs/kit';
import { PlaybackSettingsPatch, savePlaybackSettings } from '$lib/server/profile-settings';
import { requireProfile } from '$lib/server/profiles';

/**
 * Partial update of the signed-in viewer's playback settings — the player
 * calls this when an audio track is picked so the language follows the
 * active profile (the /settings/playback page uses a form action).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false }, { status: 401 });
	const profile = requireProfile(locals);
	const parsed = PlaybackSettingsPatch.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'invalid playback settings');
	const settings = await savePlaybackSettings(profile.id, parsed.data);
	return json({ ok: true, settings });
};
