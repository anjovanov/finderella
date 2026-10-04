import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	ACCENT_IDS,
	APP_NAME_MAX,
	BODY_FONT_IDS,
	DEFAULT_BRANDING,
	HEADING_FONT_IDS,
	TAGLINE_MAX
} from '$lib/data/branding';
import { getBranding, updateSiteSettings } from '$lib/server/site-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ branding: await getBranding() });

const BrandingForm = z.object({
	appName: z
		.string()
		.trim()
		.min(1, 'Give the app a name.')
		.max(APP_NAME_MAX, `Keep the name to ${APP_NAME_MAX} characters.`),
	tagline: z
		.string()
		.trim()
		.max(TAGLINE_MAX, `Keep the tagline to ${TAGLINE_MAX} characters.`)
		.transform((v) => v || null),
	accent: z.enum(ACCENT_IDS, 'Pick one of the accent colours.'),
	bodyFont: z.enum(BODY_FONT_IDS, 'Pick one of the body fonts.'),
	headingFont: z.enum(HEADING_FONT_IDS, 'Pick one of the heading fonts.')
});

export const actions: Actions = {
	save: async (event) => {
		const formData = await event.request.formData();
		const parsed = BrandingForm.safeParse({
			appName: formData.get('appName') ?? '',
			tagline: formData.get('tagline') ?? '',
			accent: formData.get('accent'),
			bodyFont: formData.get('bodyFont'),
			headingFont: formData.get('headingFont')
		});
		if (!parsed.success) {
			return fail(400, { brandingError: parsed.error.issues[0]?.message ?? 'Check the form.' });
		}
		await updateSiteSettings(parsed.data);
		return { brandingSaved: true };
	},

	reset: async () => {
		await updateSiteSettings(DEFAULT_BRANDING);
		return { brandingReset: true };
	}
};
