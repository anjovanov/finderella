import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { LIMIT_MAX, LIMIT_MIN } from '$lib/data/account-limits';
import { countOrphans, pruneCatalog } from '$lib/server/catalog/prune';
import { enrichPending, isTmdbConfigured, metadataStatus } from '$lib/server/metadata';
import { tmdbCredentials, updateMetadataSettings } from '$lib/server/metadata/settings';
import { testTmdbKey } from '$lib/server/metadata/tmdb';
import { queueMarkerAnalysis } from '$lib/server/markers/job';
import { runScheduledScans } from '$lib/server/gateways/scan-schedule';
import { syncAllWatchedLibraries } from '$lib/server/gateways/watch';
import { queueTrickplayGeneration } from '$lib/server/trickplay/bulk';
import { SCAN_INTERVAL_HOURS } from '$lib/data/library-scanning';
import { log } from '$lib/server/log';
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
			trickplayAuto: settings.trickplayAuto,
			watchLibraries: settings.watchLibraries,
			scanIntervalHours: settings.scanIntervalHours,
			markersEnabled: settings.markersEnabled,
			remuxEnabled: settings.remuxEnabled,
			maxSessionsPerAccount: settings.maxSessionsPerAccount,
			maxProfilesPerAccount: settings.maxProfilesPerAccount
		},
		orphans,
		metadata
	};
};

/** '' / 'off' = no periodic rescans. */
const ScanInterval = z.union([
	z.enum(['', 'off']).transform(() => null),
	z.coerce
		.number()
		.int()
		.refine((h) => (SCAN_INTERVAL_HOURS as readonly number[]).includes(h))
]);

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
		// Both trickplay switches live in this form.
		const trickplayEnabled = formData.get('trickplayEnabled')?.toString() === 'true';
		const trickplayAuto = formData.get('trickplayAuto')?.toString() === 'true';
		await updateSiteSettings({ trickplayEnabled, trickplayAuto });
		// Catch up on whatever was scanned while it was off (no-op unless both are on).
		queueTrickplayGeneration();
		return { saved: true };
	},

	// Its own action too: the watch switch and the rescan interval, posted together.
	updateScanning: async (event) => {
		const formData = await event.request.formData();
		const watchLibraries = formData.get('watchLibraries')?.toString() === 'true';
		const interval = ScanInterval.safeParse(formData.get('scanIntervalHours')?.toString() ?? '');
		if (!interval.success) return fail(400, { message: 'Pick one of the offered intervals' });
		await updateSiteSettings({ watchLibraries, scanIntervalHours: interval.data });
		// Devices start or stop watching now; a shorter interval may make libraries due now.
		await syncAllWatchedLibraries();
		void runScheduledScans().catch((err) => log.error({ err }, 'scheduled scans failed'));
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

	// Blank field = keep the saved key (like /admin/subtitles); the checkbox removes it,
	// falling back to TMDB_API_KEY. A new key is tested before it's stored, so a typo
	// can't silently stop enrichment.
	saveTmdb: async (event) => {
		const formData = await event.request.formData();
		if (formData.get('clearTmdb')) {
			await updateMetadataSettings({ tmdbApiKey: null });
			return { tmdbSaved: 'removed' as const };
		}
		const key = formData.get('tmdbApiKey')?.toString().trim() ?? '';
		if (!key) return fail(400, { tmdbError: 'Enter an API key to save.' });
		try {
			await testTmdbKey(key);
		} catch (err) {
			return fail(400, { tmdbError: (err as Error).message });
		}
		await updateMetadataSettings({ tmdbApiKey: key });
		// Titles scanned while no (working) key was set get their metadata now.
		void enrichPending().catch(() => {});
		return { tmdbSaved: 'saved' as const };
	},

	testTmdb: async () => {
		const credentials = await tmdbCredentials();
		if (!credentials) return fail(400, { tmdbError: 'Add a TMDB API key first.' });
		try {
			return { tmdbTest: await testTmdbKey(credentials.key) };
		} catch (err) {
			return fail(400, { tmdbError: (err as Error).message });
		}
	},

	refreshMetadata: async () => {
		if (!(await isTmdbConfigured())) return fail(400, { message: 'Add a TMDB API key first' });
		// Runs in the background; the page shows progress via the pending counts.
		void enrichPending({ force: true });
		return { refreshing: true };
	}
};
