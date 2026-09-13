import { error, json, type RequestHandler } from '@sveltejs/kit';
import { saveSubtitleSettings, SubtitleSettingsPatch } from '$lib/server/user-settings';

/**
 * Partial update of the signed-in viewer's subtitle settings — the player
 * calls this when a language is picked from its menu so the choice follows
 * the account (the /settings page uses a form action for the full set).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) return json({ ok: false }, { status: 401 });
	const parsed = SubtitleSettingsPatch.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'invalid subtitle settings');
	const settings = await saveSubtitleSettings(user.id, parsed.data);
	return json({ ok: true, settings });
};
