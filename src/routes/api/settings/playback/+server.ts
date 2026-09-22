import { error, json, type RequestHandler } from '@sveltejs/kit';
import { PlaybackSettingsPatch, savePlaybackSettings } from '$lib/server/user-settings';

/**
 * Partial update of the signed-in viewer's playback settings — the player
 * calls this when an audio track is picked so the language follows the
 * account (the /settings/playback page uses a form action).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ ok: false }, { status: 401 });
	const parsed = PlaybackSettingsPatch.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'invalid playback settings');
	const settings = await savePlaybackSettings(user.id, parsed.data);
	return json({ ok: true, settings });
};
