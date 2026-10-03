import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { LIMIT_MAX, LIMIT_MIN } from '$lib/data/account-limits';
import { countOrphans, pruneCatalog } from '$lib/server/catalog/prune';
import { enrichPending, isTmdbConfigured, metadataStatus } from '$lib/server/metadata';
import { queueMarkerAnalysis } from '$lib/server/markers/job';
import { getSiteSettings, updateSiteSettings } from '$lib/server/site-settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [settings, orphans, metadata] = await Promise.all([
		getSiteSettings(),
		countOrphans(),
		metadataStatus()
	]);
	return {
		settings: {
			allowRegistration: settings.allowRegistration,
			requireLogin: settings.requireLogin,
			trickplayEnabled: settings.trickplayEnabled,
			markersEnabled: settings.markersEnabled,
			remuxEnabled: settings.remuxEnabled,
			maxSessionsPerAccount: settings.maxSessionsPerAccount,
			maxProfilesPerAccount: settings.maxProfilesPerAccount
		},
		orphans,
		metadata
	};
};

const Limit = z.coerce.number().int().min(LIMIT_MIN).max(LIMIT_MAX);

/** `<key>Enabled` off = unlimited (null); on = `<key>` must be a whole number in range. */
function readLimit(form: FormData, key: string, label: string) {
	if (form.get(`${key}Enabled`) !== 'true') return { ok: true as const, value: null };
	const parsed = Limit.safeParse(form.get(key));
	return parsed.success
		? { ok: true as const, value: parsed.data }
		: {
				ok: false as const,
				message: `${label} must be a whole number from ${LIMIT_MIN} to ${LIMIT_MAX}.`
			};
}

export const actions: Actions = {
	// Its own action and form, like the switches below: a shared form would
	// overwrite settings that weren't posted.
	updateLimits: async (event) => {
		const formData = await event.request.formData();
		const sessions = readLimit(formData, 'maxSessions', 'Signed-in devices');
		if (!sessions.ok) return fail(400, { limitsError: sessions.message });
		const profiles = readLimit(formData, 'maxProfiles', 'Profiles');
		if (!profiles.ok) return fail(400, { limitsError: profiles.message });
		await updateSiteSettings({
			maxSessionsPerAccount: sessions.value,
			maxProfilesPerAccount: profiles.value
		});
		return { limitsSaved: true };
	},

	updateSettings: async (event) => {
		const formData = await event.request.formData();
		// Both switches live in one form, so both values arrive together.
		const allowRegistration = formData.get('allowRegistration')?.toString() === 'true';
		const requireLogin = formData.get('requireLogin')?.toString() === 'true';
		await updateSiteSettings({ allowRegistration, requireLogin });
		return { saved: true };
	},

	// Its own action: updateSettings writes both Access switches from one form
	// and would blank them if this switch posted there without those fields.
	updateTrickplay: async (event) => {
		const formData = await event.request.formData();
		const trickplayEnabled = formData.get('trickplayEnabled')?.toString() === 'true';
		await updateSiteSettings({ trickplayEnabled });
		return { saved: true };
	},

	// Its own action too, for the same reason.
	updateMarkers: async (event) => {
		const formData = await event.request.formData();
		const markersEnabled = formData.get('markersEnabled')?.toString() === 'true';
		await updateSiteSettings({ markersEnabled });
		// Catch up on whatever was scanned while it was off.
		if (markersEnabled) queueMarkerAnalysis();
		return { saved: true };
	},

	// Its own action too, for the same reason.
	updateRemux: async (event) => {
		const formData = await event.request.formData();
		const remuxEnabled = formData.get('remuxEnabled')?.toString() === 'true';
		await updateSiteSettings({ remuxEnabled });
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
