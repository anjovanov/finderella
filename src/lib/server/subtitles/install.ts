import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { library, mediaSubtitle, subtitleDownload } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import type { MediaFileRow } from '$lib/server/streaming/compat';
import { sidecarRelPath } from './naming';
import { normalizeSubtitleEncoding, sanitizeSubtitleText } from './charset';
import { looksLikeSubtitle } from './validate';
import { downloadGestdown } from './providers/gestdown';
import { downloadOpenSubtitles } from './providers/opensubtitles';
import { downloadSubdl } from './providers/subdl';
import { downloadTitlovi } from './providers/titlovi';
import {
	ProviderError,
	type DownloadedSubtitle,
	type SubtitleCandidate,
	type TitleQuery
} from './providers/types';
import type { SubtitleProviderSettings } from './settings';

export type DownloadSource = 'player' | 'bulk' | 'auto';

/** Errors the caller should show verbatim (device offline, gateway too old…). */
export class InstallError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InstallError';
	}
}

/** Fetch the candidate's bytes from its provider. */
export async function fetchCandidate(
	settings: SubtitleProviderSettings,
	candidate: SubtitleCandidate,
	query: TitleQuery
): Promise<DownloadedSubtitle> {
	const download = await fetchFromProvider(settings, candidate, query);
	if (!looksLikeSubtitle(download.bytes, download.format)) {
		throw new ProviderError(
			candidate.provider,
			'network',
			'The provider returned something that is not a subtitle file'
		);
	}
	return download;
}

async function fetchFromProvider(
	settings: SubtitleProviderSettings,
	candidate: SubtitleCandidate,
	query: TitleQuery
): Promise<DownloadedSubtitle> {
	if (candidate.provider === 'opensubtitles') {
		if (!settings.opensubtitlesApiKey)
			throw new ProviderError('opensubtitles', 'not-configured', 'OpenSubtitles is not configured');
		return downloadOpenSubtitles(
			{
				apiKey: settings.opensubtitlesApiKey,
				username: settings.opensubtitlesUsername,
				password: settings.opensubtitlesPassword
			},
			candidate.id
		);
	}
	const wanted = { season: query.season, episode: query.episode };
	if (candidate.provider === 'subdl') {
		if (!settings.subdlApiKey)
			throw new ProviderError('subdl', 'not-configured', 'Subdl is not configured');
		return downloadSubdl(settings.subdlApiKey, candidate.id, wanted);
	}
	if (candidate.provider === 'gestdown') {
		if (!settings.gestdownEnabled)
			throw new ProviderError('gestdown', 'not-configured', 'Gestdown is not enabled');
		return downloadGestdown(candidate.id, wanted);
	}
	if (!settings.titloviUsername || !settings.titloviPassword) {
		throw new ProviderError('titlovi', 'not-configured', 'Titlovi is not configured');
	}
	return downloadTitlovi(candidate.id, wanted, candidate.script);
}

// One install at a time per file: the bulk job and a viewer could otherwise
// both pick `<stem>.en.srt` and one would overwrite the other.
const perFile = new Map<string, Promise<unknown>>();
function serialized<T>(fileId: string, work: () => Promise<T>): Promise<T> {
	const prev = perFile.get(fileId) ?? Promise.resolve();
	const next = prev.then(work, work);
	perFile.set(
		fileId,
		next.catch(() => {})
	);
	void next.finally(() => {
		if (perFile.get(fileId) === next) perFile.delete(fileId);
	});
	return next;
}

/**
 * Write a downloaded subtitle beside the video on its device and register it
 * as a sidecar row (served immediately, re-found by the next scan). Returns
 * the new media_subtitle id.
 */
export async function installSubtitle(opts: {
	file: MediaFileRow;
	candidate: SubtitleCandidate;
	download: DownloadedSubtitle;
	source: DownloadSource;
	userId: string | null;
}): Promise<string> {
	const { file, candidate, download } = opts;
	return serialized(file.id, async () => {
		const gateway = registry.get(file.gatewayId);
		if (!gateway) throw new InstallError('The device holding this title is offline.');
		if (!gateway.capabilities.subtitleWrite) {
			throw new InstallError(
				'The device holding this title runs a gateway too old to save subtitles; update it.'
			);
		}
		const lib = await db.query.library.findFirst({ where: eq(library.id, file.libraryId) });
		if (!lib) throw new InstallError('The library of this file no longer exists.');
		const existing = new Set(
			(await db.query.mediaSubtitle.findMany({ where: eq(mediaSubtitle.mediaFileId, file.id) }))
				.map((row) => row.relPath)
				.filter((p): p is string => !!p)
		);
		// Providers hand out legacy code pages without saying so; the device gets UTF-8.
		const utf8 = normalizeSubtitleEncoding(download.bytes, candidate.language, candidate.script);
		const bytes = new TextEncoder().encode(
			sanitizeSubtitleText(new TextDecoder().decode(utf8), download.format)
		);
		const contentBase64 = Buffer.from(bytes).toString('base64');
		let relPath = '';
		for (let attempt = 1; attempt <= 20; attempt++) {
			relPath = sidecarRelPath(file.relPath, {
				language: candidate.language,
				hearingImpaired: candidate.hearingImpaired,
				format: download.format,
				attempt
			});
			if (existing.has(relPath)) continue;
			try {
				await registry.request(
					file.gatewayId,
					{
						type: 'subtitle.put',
						rootPath: lib.rootPath,
						relPath,
						contentBase64,
						overwrite: false
					},
					{ timeoutMs: 15_000 }
				);
				break;
			} catch (err) {
				if ((err as Error).message === 'exists') continue;
				throw new InstallError(`The device could not save the subtitle: ${(err as Error).message}`);
			}
		}
		const [row] = await db
			.insert(mediaSubtitle)
			.values({
				mediaFileId: file.id,
				source: 'sidecar',
				relPath,
				format: download.format,
				language: candidate.language,
				title: null,
				forced: candidate.forced,
				hearingImpaired: candidate.hearingImpaired
			})
			.returning({ id: mediaSubtitle.id });
		await db.insert(subtitleDownload).values({
			mediaFileId: file.id,
			language: candidate.language,
			provider: candidate.provider,
			providerId: candidate.id,
			releaseName: candidate.releaseName,
			relPath,
			status: 'downloaded',
			source: opts.source,
			userId: opts.userId
		});
		log.info(
			{
				fileId: file.id,
				relPath,
				provider: candidate.provider,
				language: candidate.language,
				source: opts.source
			},
			'subtitle downloaded'
		);
		return row.id;
	});
}

/** Record a miss/failure so the bulk job doesn't spend quota on it again soon. */
export async function recordDownloadOutcome(opts: {
	file: MediaFileRow;
	language: string;
	status: 'not_found' | 'failed';
	provider?: SubtitleCandidate['provider'];
	error?: string;
	source: DownloadSource;
	userId: string | null;
}): Promise<void> {
	await db.insert(subtitleDownload).values({
		mediaFileId: opts.file.id,
		language: opts.language,
		provider: opts.provider ?? null,
		status: opts.status,
		error: opts.error ?? null,
		source: opts.source,
		userId: opts.userId
	});
}
