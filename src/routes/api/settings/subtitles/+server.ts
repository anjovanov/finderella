import { error, json, type RequestHandler } from '@sveltejs/kit';
import { saveSubtitleSettings, SubtitleSettingsPatch } from '$lib/server/profile-settings';
import { requireProfile } from '$lib/server/profiles';

/**
 * Partial update of the signed-in viewer's subtitle settings — the player
 * calls this when a language is picked from its menu so the choice follows
 * the active profile (the /settings page uses a form action for the full set).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false }, { status: 401 });
	const profile = requireProfile(locals);
	const parsed = SubtitleSettingsPatch.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'invalid subtitle settings');
	const settings = await saveSubtitleSettings(profile.id, parsed.data);
	return json({ ok: true, settings });
};
