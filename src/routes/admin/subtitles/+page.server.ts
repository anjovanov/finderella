import { desc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { normalizeLanguage } from '@finderella/protocol';
import { db } from '$lib/server/db';
import { episode, mediaFile, movie, series, subtitleDownload } from '$lib/server/db/schema';
import { bulkStatus, startBulkDownload, stopBulkDownload } from '$lib/server/subtitles/bulk';
import {
	resetOpenSubtitlesSession,
	testOpenSubtitles
} from '$lib/server/subtitles/providers/opensubtitles';
import { testSubdl } from '$lib/server/subtitles/providers/subdl';
import { testGestdown } from '$lib/server/subtitles/providers/gestdown';
import { resetTitloviSession, testTitlovi } from '$lib/server/subtitles/providers/titlovi';
import {
	configuredProviders,
	getSubtitleProviderSettings,
	parseLanguageList,
	updateSubtitleProviderSettings
} from '$lib/server/subtitles/settings';
import type { Actions, PageServerLoad } from './$types';

function mask(secret: string | null | undefined): string | null {
	const value = secret?.trim();
	if (!value) return null;
	return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

export const load: PageServerLoad = async () => {
	const settings = await getSubtitleProviderSettings();
	const [recent, [counts]] = await Promise.all([
		db
			.select({
				id: subtitleDownload.id,
				language: subtitleDownload.language,
				provider: subtitleDownload.provider,
				releaseName: subtitleDownload.releaseName,
				status: subtitleDownload.status,
				error: subtitleDownload.error,
				source: subtitleDownload.source,
				createdAt: subtitleDownload.createdAt,
				relPath: mediaFile.relPath,
				movieTitle: movie.title,
				seriesTitle: series.title,
				episodeNumber: episode.number
			})
			.from(subtitleDownload)
			.innerJoin(mediaFile, eq(mediaFile.id, subtitleDownload.mediaFileId))
			.leftJoin(movie, eq(movie.id, mediaFile.movieId))
			.leftJoin(episode, eq(episode.id, mediaFile.episodeId))
			.leftJoin(series, eq(series.id, episode.seriesId))
			.orderBy(desc(subtitleDownload.createdAt))
			.limit(50),
		db
			.select({
				downloaded: sql<number>`count(*) filter (where ${subtitleDownload.status} = 'downloaded')`,
				notFound: sql<number>`count(*) filter (where ${subtitleDownload.status} = 'not_found')`
			})
			.from(subtitleDownload)
	]);
	return {
		providers: {
			opensubtitles: {
				configured: !!settings.opensubtitlesApiKey?.trim(),
				apiKey: mask(settings.opensubtitlesApiKey),
				username: settings.opensubtitlesUsername ?? '',
				hasPassword: !!settings.opensubtitlesPassword
			},
			subdl: { configured: !!settings.subdlApiKey?.trim(), apiKey: mask(settings.subdlApiKey) },
			gestdown: { enabled: settings.gestdownEnabled },
			titlovi: {
				configured: !!settings.titloviUsername?.trim() && !!settings.titloviPassword,
				username: settings.titloviUsername ?? '',
				hasPassword: !!settings.titloviPassword
			}
		},
		download: {
			languages: parseLanguageList(settings.languages),
			autoDownload: settings.autoDownload,
			preferHearingImpaired: settings.preferHearingImpaired
		},
		configuredProviders: configuredProviders(settings),
		job: bulkStatus(),
		recent: recent.map((row) => ({
			...row,
			createdAt: row.createdAt.toISOString(),
			title:
				row.movieTitle ??
				(row.seriesTitle ? `${row.seriesTitle} · E${row.episodeNumber}` : row.relPath)
		})),
		totals: { downloaded: Number(counts?.downloaded ?? 0), notFound: Number(counts?.notFound ?? 0) }
	};
};

export const actions: Actions = {
	saveProviders: async ({ request }) => {
		const form = await request.formData();
		const text = (name: string) => form.get(name)?.toString().trim() ?? '';
		const current = await getSubtitleProviderSettings();
		// Blank secret fields keep the stored value; the "clear" boxes remove it.
		const patch = {
			opensubtitlesApiKey: form.get('clearOpensubtitles')
				? null
				: text('opensubtitlesApiKey') || current.opensubtitlesApiKey,
			opensubtitlesUsername: form.get('clearOpensubtitles')
				? null
				: text('opensubtitlesUsername') || null,
			opensubtitlesPassword: form.get('clearOpensubtitles')
				? null
				: text('opensubtitlesPassword') || current.opensubtitlesPassword,
			subdlApiKey: form.get('clearSubdl') ? null : text('subdlApiKey') || current.subdlApiKey,
			gestdownEnabled: form.get('gestdownEnabled') === 'true',
			titloviUsername: form.get('clearTitlovi') ? null : text('titloviUsername') || null,
			titloviPassword: form.get('clearTitlovi')
				? null
				: text('titloviPassword') || current.titloviPassword
		};
		await updateSubtitleProviderSettings(patch);
		resetOpenSubtitlesSession();
		resetTitloviSession();
		return { section: 'providers', saved: true };
	},

	testProviders: async () => {
		const settings = await getSubtitleProviderSettings();
		const results: { provider: string; ok: boolean; message: string }[] = [];
		if (settings.opensubtitlesApiKey?.trim()) {
			try {
				results.push({
					provider: 'OpenSubtitles',
					ok: true,
					message: await testOpenSubtitles({
						apiKey: settings.opensubtitlesApiKey,
						username: settings.opensubtitlesUsername,
						password: settings.opensubtitlesPassword
					})
				});
			} catch (err) {
				results.push({ provider: 'OpenSubtitles', ok: false, message: (err as Error).message });
			}
		}
		if (settings.subdlApiKey?.trim()) {
			try {
				results.push({
					provider: 'Subdl',
					ok: true,
					message: await testSubdl(settings.subdlApiKey)
				});
			} catch (err) {
				results.push({ provider: 'Subdl', ok: false, message: (err as Error).message });
			}
		}
		if (settings.gestdownEnabled) {
			try {
				results.push({ provider: 'Gestdown', ok: true, message: await testGestdown() });
			} catch (err) {
				results.push({ provider: 'Gestdown', ok: false, message: (err as Error).message });
			}
		}
		if (settings.titloviUsername?.trim() && settings.titloviPassword) {
			try {
				results.push({
					provider: 'Titlovi',
					ok: true,
					message: await testTitlovi({
						username: settings.titloviUsername,
						password: settings.titloviPassword
					})
				});
			} catch (err) {
				results.push({ provider: 'Titlovi', ok: false, message: (err as Error).message });
			}
		}
		if (results.length === 0)
			return fail(400, { section: 'providers', message: 'Enable a provider first' });
		return { section: 'providers', tests: results };
	},

	saveDownloadSettings: async ({ request }) => {
		const form = await request.formData();
		const languages = form
			.getAll('languages')
			.map((v) => normalizeLanguage(v.toString()))
			.filter((v): v is string => !!v);
		if (languages.length === 0) {
			return fail(400, { section: 'download', message: 'Pick at least one language' });
		}
		await updateSubtitleProviderSettings({
			languages: languages.join(','),
			autoDownload: form.get('autoDownload') === 'true',
			preferHearingImpaired: form.get('preferHearingImpaired') === 'true'
		});
		return { section: 'download', saved: true };
	},

	startBulk: async ({ request }) => {
		const form = await request.formData();
		const scopeRaw = form.get('scope')?.toString();
		const scope = scopeRaw === 'movies' || scopeRaw === 'series' ? scopeRaw : 'all';
		const settings = await getSubtitleProviderSettings();
		if (configuredProviders(settings).length === 0) {
			return fail(400, { section: 'bulk', message: 'Configure a provider first' });
		}
		const started = startBulkDownload({ scope, retryMisses: form.get('retryMisses') === 'on' });
		if (!started)
			return fail(409, { section: 'bulk', message: 'A download run is already in progress' });
		return { section: 'bulk', started: true };
	},

	stopBulk: async () => {
		stopBulkDownload();
		return { section: 'bulk', stopping: true };
	}
};
