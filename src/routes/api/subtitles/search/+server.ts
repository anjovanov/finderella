import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { normalizeLanguage } from '@finderella/protocol';
import { registry } from '$lib/server/gateways/registry';
import { activeFilesFor, searchSubtitles, titleQueryForFile } from '$lib/server/subtitles/search';
import { configuredProviders, getSubtitleProviderSettings } from '$lib/server/subtitles/settings';

const SearchRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	episodeSlug: z.string().min(1).optional(),
	language: z.string().min(2).max(3)
});

/**
 * Search the configured providers for the title a viewer is watching. Any
 * signed-in account may search; results are ranked against the file the
 * viewer would get (the best online copy).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to search for subtitles.');
	const parsed = SearchRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug, episodeSlug?, language }');
	const language = normalizeLanguage(parsed.data.language);
	if (!language) error(400, 'unknown language');
	const settings = await getSubtitleProviderSettings();
	if (configuredProviders(settings).length === 0) {
		error(
			503,
			'No subtitle provider is configured. Ask an administrator to add one on the dashboard.'
		);
	}
	const files = await activeFilesFor(parsed.data.kind, parsed.data.slug, parsed.data.episodeSlug);
	const file = files.find((f) => registry.isOnline(f.gatewayId)) ?? files[0];
	if (!file) error(404, 'No media file is linked to this title.');
	const query = await titleQueryForFile(file);
	if (!query) error(404, 'This title is missing from the catalog.');
	const outcome = await searchSubtitles(settings, query, language);
	return json({
		candidates: outcome.candidates,
		errors: outcome.errors.map((e) => ({ ...e, resetAt: e.resetAt?.toISOString() ?? null })),
		query: { title: query.title, year: query.year, season: query.season, episode: query.episode }
	});
};
