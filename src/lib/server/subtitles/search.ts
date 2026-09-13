import { and, eq } from 'drizzle-orm';
import { posix } from 'node:path';
import { db } from '$lib/server/db';
import { episode, mediaFile, movie, season, series } from '$lib/server/db/schema';
import { log } from '$lib/server/log';
import type { MediaFileRow } from '$lib/server/streaming/compat';
import { searchGestdown } from './providers/gestdown';
import { searchOpenSubtitles } from './providers/opensubtitles';
import { searchSubdl } from './providers/subdl';
import { searchTitlovi } from './providers/titlovi';
import { titloviSupports } from './providers/titlovi-languages';
import {
	ProviderError,
	type SubtitleCandidate,
	type SubtitleProviderId,
	type TitleQuery
} from './providers/types';
import { rankCandidates } from './rank';
import { configuredProviders, type SubtitleProviderSettings } from './settings';

/** What the catalog knows about the title a media file belongs to. */
export async function titleQueryForFile(file: MediaFileRow): Promise<TitleQuery | null> {
	const fileName = posix.basename(file.relPath);
	if (file.movieId) {
		const row = await db.query.movie.findFirst({ where: eq(movie.id, file.movieId) });
		if (!row) return null;
		return {
			kind: 'movie',
			tmdbId: row.tmdbId ?? undefined,
			title: row.title,
			year: row.year,
			fileName
		};
	}
	if (file.episodeId) {
		const ep = await db.query.episode.findFirst({ where: eq(episode.id, file.episodeId) });
		if (!ep) return null;
		const [show, s] = await Promise.all([
			db.query.series.findFirst({ where: eq(series.id, ep.seriesId) }),
			db.query.season.findFirst({ where: eq(season.id, ep.seasonId) })
		]);
		if (!show || !s) return null;
		return {
			kind: 'episode',
			tmdbId: show.tmdbId ?? undefined,
			title: show.title,
			year: show.year,
			season: s.number,
			episode: ep.number,
			fileName
		};
	}
	return null;
}

/** Active files of a title, for the player flow (by slugs). */
export async function activeFilesFor(
	kind: 'movie' | 'series',
	slug: string,
	episodeSlug?: string
): Promise<MediaFileRow[]> {
	if (kind === 'movie') {
		const row = await db.query.movie.findFirst({ where: eq(movie.slug, slug) });
		if (!row) return [];
		return db.query.mediaFile.findMany({
			where: and(eq(mediaFile.movieId, row.id), eq(mediaFile.status, 'active'))
		});
	}
	const show = await db.query.series.findFirst({ where: eq(series.slug, slug) });
	if (!show || !episodeSlug) return [];
	const ep = await db.query.episode.findFirst({
		where: and(eq(episode.seriesId, show.id), eq(episode.slug, episodeSlug))
	});
	if (!ep) return [];
	return db.query.mediaFile.findMany({
		where: and(eq(mediaFile.episodeId, ep.id), eq(mediaFile.status, 'active'))
	});
}

export interface SearchOutcome {
	candidates: SubtitleCandidate[];
	errors: {
		provider: SubtitleProviderId;
		kind: ProviderError['kind'];
		message: string;
		resetAt?: Date;
	}[];
}

/** Whether a provider can serve this title/language at all (skipped silently otherwise). */
export function providerApplies(
	provider: SubtitleProviderId,
	query: TitleQuery,
	language: string
): boolean {
	if (provider === 'gestdown') return query.kind === 'episode';
	if (provider === 'titlovi') return titloviSupports(language);
	return true;
}

function searchOne(
	provider: SubtitleProviderId,
	settings: SubtitleProviderSettings,
	query: TitleQuery,
	language: string,
	opts: { excludeAi?: boolean }
): Promise<SubtitleCandidate[]> {
	switch (provider) {
		case 'opensubtitles':
			return searchOpenSubtitles(
				{
					apiKey: settings.opensubtitlesApiKey!,
					username: settings.opensubtitlesUsername,
					password: settings.opensubtitlesPassword
				},
				query,
				language,
				{ excludeAi: opts.excludeAi }
			);
		case 'subdl':
			return searchSubdl(settings.subdlApiKey!, query, language);
		case 'gestdown':
			return searchGestdown(query, language);
		case 'titlovi':
			return searchTitlovi(
				{ username: settings.titloviUsername!, password: settings.titloviPassword! },
				query,
				language
			);
	}
}

/** Ask every configured provider and rank the union. Provider failures are reported, not thrown. */
export async function searchSubtitles(
	settings: SubtitleProviderSettings,
	query: TitleQuery,
	language: string,
	opts: { excludeAi?: boolean; providers?: SubtitleProviderId[] } = {}
): Promise<SearchOutcome> {
	const providers = (opts.providers ?? configuredProviders(settings)).filter((provider) =>
		providerApplies(provider, query, language)
	);
	const results = await Promise.allSettled(
		providers.map((provider) => searchOne(provider, settings, query, language, opts))
	);
	const candidates: SubtitleCandidate[] = [];
	const errors: SearchOutcome['errors'] = [];
	results.forEach((result, i) => {
		if (result.status === 'fulfilled') candidates.push(...result.value);
		else if (result.reason instanceof ProviderError) {
			const err = result.reason;
			errors.push({
				provider: err.provider,
				kind: err.kind,
				message: err.message,
				resetAt: err.resetAt
			});
		} else {
			log.warn({ err: result.reason, provider: providers[i] }, 'subtitle search failed');
			errors.push({ provider: providers[i], kind: 'network', message: String(result.reason) });
		}
	});
	return {
		candidates: rankCandidates(candidates, {
			fileName: query.fileName,
			preferHearingImpaired: settings.preferHearingImpaired,
			providerOrder: providers
		}),
		errors
	};
}
