import { fail } from '@sveltejs/kit';
import { countOrphans, pruneCatalog } from '$lib/server/catalog/prune';
import { enrichPending, isTmdbConfigured, metadataStatus } from '$lib/server/metadata';
import { getSiteSettings, updateSiteSettings } from '$lib/server/site-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [settings, orphans, metadata] = await Promise.all([
		getSiteSettings(),
		countOrphans(),
		metadataStatus()
	]);
	return { settings: { allowRegistration: settings.allowRegistration }, orphans, metadata };
};

export const actions: Actions = {
	updateSettings: async (event) => {
		const formData = await event.request.formData();
		const allowRegistration = formData.get('allowRegistration')?.toString() === 'true';
		await updateSiteSettings({ allowRegistration });
		return { saved: true };
	},

	pruneCatalog: async () => {
		const pruned = await pruneCatalog();
		return { pruned };
	},

	refreshMetadata: async () => {
		if (!isTmdbConfigured()) return fail(400, { message: 'TMDB_API_KEY is not set on the hub' });
		// Runs in the background; the page shows progress via the pending counts.
		void enrichPending({ force: true });
		return { refreshing: true };
	}
};
