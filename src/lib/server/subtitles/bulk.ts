import { and, desc, eq, gt, inArray, isNotNull, or } from 'drizzle-orm';
import { posix } from 'node:path';
import { db } from '$lib/server/db';
import { mediaFile, mediaSubtitle, subtitleDownload } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import { log } from '$lib/server/log';
import type { MediaFileRow } from '$lib/server/streaming/compat';
import {
	fetchCandidate,
	installSubtitle,
	recordDownloadOutcome,
	InstallError,
	type DownloadSource
} from './install';
import { sleep } from './limiter';
import { openSubtitlesQuota } from './providers/opensubtitles';
import { ProviderError, type SubtitleProviderId } from './providers/types';
import { searchSubtitles, titleQueryForFile, withMovieHash } from './search';
import { configuredProviders, getSubtitleProviderSettings, parseLanguageList } from './settings';

/**
 * Bulk / automatic subtitle downloads. Single-flight like the metadata
 * runner, but with live progress and a stop switch. Work = one (file,
 * language) pair per title lacking a track in that language; a provider that
 * runs out of quota (or rejects the key) is dropped for the rest of the run.
 */

export type BulkScope = 'all' | 'movies' | 'series';

export interface BulkOptions {
	scope: BulkScope;
	/** Override the configured list (admin form); defaults to settings. */
	languages?: string[];
	/** Search again for pairs that were `not_found` within the last week. */
	retryMisses?: boolean;
	source: DownloadSource;
	/** Auto mode: only files first seen after this instant. */
	since?: Date;
}

export interface BulkStatus {
	running: boolean;
	source: DownloadSource | null;
	startedAt: string | null;
	finishedAt: string | null;
	total: number;
	processed: number;
	downloaded: number;
	notFound: number;
	failed: number;
	skippedOffline: number;
	current: string | null;
	stopRequested: boolean;
	disabledProviders: { provider: SubtitleProviderId; reason: string }[];
	quota: { opensubtitlesRemaining: number | null; opensubtitlesResetAt: string | null };
	recent: { at: string; level: 'info' | 'warn' | 'error'; message: string }[];
	lastError: string | null;
}

const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PACING_MS = 300;
const RECENT_LINES = 40;

const status: BulkStatus = {
	running: false,
	source: null,
	startedAt: null,
	finishedAt: null,
	total: 0,
	processed: 0,
	downloaded: 0,
	notFound: 0,
	failed: 0,
	skippedOffline: 0,
	current: null,
	stopRequested: false,
	disabledProviders: [],
	quota: { opensubtitlesRemaining: null, opensubtitlesResetAt: null },
	recent: [],
	lastError: null
};
let queuedAuto: Date | null = null;
let lastAutoRun: Date | null = null;

function note(level: BulkStatus['recent'][number]['level'], message: string) {
	status.recent.unshift({ at: new Date().toISOString(), level, message });
	if (status.recent.length > RECENT_LINES) status.recent.length = RECENT_LINES;
	if (level === 'error') log.warn({ message }, 'subtitle bulk');
	else log.info({ message }, 'subtitle bulk');
}

export function bulkStatus(): BulkStatus {
	const q = openSubtitlesQuota();
	return {
		...status,
		quota: {
			opensubtitlesRemaining: q?.remaining ?? null,
			opensubtitlesResetAt: q?.resetAt?.toISOString() ?? null
		},
		disabledProviders: [...status.disabledProviders],
		recent: [...status.recent]
	};
}

export function stopBulkDownload(): void {
	if (status.running) status.stopRequested = true;
}

interface WorkItem {
	file: MediaFileRow;
	language: string;
	label: string;
}

/** Best active file per title/episode (highest resolution), optionally only recent ones. */
async function candidateFiles(scope: BulkScope, since?: Date): Promise<MediaFileRow[]> {
	const scopeFilter =
		scope === 'movies'
			? isNotNull(mediaFile.movieId)
			: scope === 'series'
				? isNotNull(mediaFile.episodeId)
				: or(isNotNull(mediaFile.movieId), isNotNull(mediaFile.episodeId));
	const rows = await db.query.mediaFile.findMany({
		where: and(
			eq(mediaFile.status, 'active'),
			scopeFilter,
			since ? gt(mediaFile.createdAt, since) : undefined
		),
		orderBy: [desc(mediaFile.height), desc(mediaFile.bitrate)]
	});
	const best = new Map<string, MediaFileRow>();
	for (const row of rows) {
		const key = row.movieId ? `m:${row.movieId}` : `e:${row.episodeId}`;
		if (!best.has(key)) best.set(key, row);
	}
	return [...best.values()];
}

async function buildWorkList(opts: BulkOptions, languages: string[]): Promise<WorkItem[]> {
	const files = await candidateFiles(opts.scope, opts.since);
	if (files.length === 0 || languages.length === 0) return [];
	const ids = files.map((f) => f.id);
	const have = await db
		.select({ fileId: mediaSubtitle.mediaFileId, language: mediaSubtitle.language })
		.from(mediaSubtitle)
		.where(inArray(mediaSubtitle.mediaFileId, ids));
	const haveSet = new Set(have.map((r) => `${r.fileId}:${r.language}`));
	const missSet = new Set<string>();
	if (!opts.retryMisses) {
		const misses = await db
			.select({ fileId: subtitleDownload.mediaFileId, language: subtitleDownload.language })
			.from(subtitleDownload)
			.where(
				and(
					inArray(subtitleDownload.mediaFileId, ids),
					eq(subtitleDownload.status, 'not_found'),
					gt(subtitleDownload.createdAt, new Date(Date.now() - MISS_TTL_MS))
				)
			);
		for (const m of misses) missSet.add(`${m.fileId}:${m.language}`);
	}
	const work: WorkItem[] = [];
	for (const file of files) {
		for (const language of languages) {
			const key = `${file.id}:${language}`;
			if (haveSet.has(key) || missSet.has(key)) continue;
			work.push({ file, language, label: `${posix.basename(file.relPath)} [${language}]` });
		}
	}
	return work;
}

async function runJob(opts: BulkOptions): Promise<void> {
	const settings = await getSubtitleProviderSettings();
	const languages = opts.languages ?? parseLanguageList(settings.languages);
	const providers = configuredProviders(settings);
	Object.assign(status, {
		running: true,
		source: opts.source,
		startedAt: new Date().toISOString(),
		finishedAt: null,
		total: 0,
		processed: 0,
		downloaded: 0,
		notFound: 0,
		failed: 0,
		skippedOffline: 0,
		current: null,
		stopRequested: false,
		disabledProviders: [],
		lastError: null
	});
	try {
		if (providers.length === 0) {
			note('error', 'No subtitle provider is configured.');
			return;
		}
		const work = await buildWorkList(opts, languages);
		status.total = work.length;
		note(
			'info',
			`${opts.source === 'auto' ? 'Auto' : 'Bulk'} download: ${work.length} title/language pairs to look up (${languages.join(', ')}).`
		);
		const active = new Set<SubtitleProviderId>(providers);
		for (const item of work) {
			if (status.stopRequested) {
				note('warn', 'Stopped by an administrator.');
				break;
			}
			if (active.size === 0) {
				note('error', 'Every provider is unavailable (quota or key); stopping.');
				break;
			}
			status.current = item.label;
			try {
				await processItem(settings, item, [...active], opts, (provider, reason) => {
					if (active.delete(provider)) {
						status.disabledProviders.push({ provider, reason });
						note('error', `${provider} disabled for this run: ${reason}`);
					}
				});
			} catch (err) {
				status.failed++;
				status.lastError = (err as Error).message;
				note('error', `${item.label}: ${(err as Error).message}`);
			}
			status.processed++;
			await sleep(PACING_MS);
		}
		note(
			'info',
			`Finished: ${status.downloaded} downloaded, ${status.notFound} not found, ${status.failed} failed, ${status.skippedOffline} skipped (device offline).`
		);
	} finally {
		status.running = false;
		status.current = null;
		status.finishedAt = new Date().toISOString();
	}
}

async function processItem(
	settings: Awaited<ReturnType<typeof getSubtitleProviderSettings>>,
	item: WorkItem,
	providers: SubtitleProviderId[],
	opts: BulkOptions,
	disable: (provider: SubtitleProviderId, reason: string) => void
): Promise<void> {
	const { file, language } = item;
	if (!registry.get(file.gatewayId)?.capabilities.subtitleWrite) {
		status.skippedOffline++;
		return;
	}
	const bare = await titleQueryForFile(file);
	if (!bare) {
		status.failed++;
		return;
	}
	const query = await withMovieHash(bare, file);
	const outcome = await searchSubtitles(settings, query, language, { excludeAi: true, providers });
	for (const err of outcome.errors) {
		if (err.kind === 'quota' || err.kind === 'auth' || err.kind === 'not-configured')
			disable(err.provider, err.message);
	}
	// Try the ranked candidates in order until one downloads and installs.
	for (const candidate of outcome.candidates.slice(0, 3)) {
		if (!providers.includes(candidate.provider)) continue;
		try {
			const download = await fetchCandidate(settings, candidate, query);
			await installSubtitle({ file, candidate, download, source: opts.source, userId: null });
			status.downloaded++;
			note(
				'info',
				`${item.label}: ${candidate.releaseName} (${candidate.provider}${candidate.matchReason === 'hash' ? ', exact match' : candidate.matchReason === 'release' ? ', same release' : ''})`
			);
			return;
		} catch (err) {
			if (err instanceof ProviderError && (err.kind === 'quota' || err.kind === 'auth')) {
				disable(err.provider, err.message);
				continue;
			}
			if (err instanceof InstallError) throw err;
			note(
				'warn',
				`${item.label}: ${candidate.releaseName} failed (${(err as Error).message}); trying the next`
			);
		}
	}
	if (outcome.candidates.length === 0 && outcome.errors.length === providers.length) {
		// Every provider errored: don't record a miss, nothing was really searched.
		status.failed++;
		return;
	}
	status.notFound++;
	await recordDownloadOutcome({
		file,
		language,
		status: 'not_found',
		source: opts.source,
		userId: null
	});
}

/** Admin-started run. Returns false when one is already running. */
export function startBulkDownload(opts: Omit<BulkOptions, 'source'>): boolean {
	if (status.running) return false;
	void runJob({ ...opts, source: 'bulk' }).catch((err) => {
		status.running = false;
		status.lastError = (err as Error).message;
		log.error({ err }, 'subtitle bulk job crashed');
	});
	return true;
}

/**
 * After a scan (and its metadata pass): fetch subtitles for files that
 * appeared since the previous auto run, when the admin switch is on. A run
 * already in progress queues one more pass.
 */
export async function queueAutoSubtitleDownload(): Promise<void> {
	const settings = await getSubtitleProviderSettings();
	if (!settings.autoDownload || configuredProviders(settings).length === 0) return;
	const since = lastAutoRun ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
	if (status.running) {
		queuedAuto = since;
		return;
	}
	lastAutoRun = new Date();
	await runJob({ scope: 'all', source: 'auto', since }).catch((err) => {
		status.running = false;
		log.error({ err }, 'auto subtitle job crashed');
	});
	if (queuedAuto) {
		const next = queuedAuto;
		queuedAuto = null;
		lastAutoRun = new Date();
		await runJob({ scope: 'all', source: 'auto', since: next }).catch((err) =>
			log.error({ err }, 'auto subtitle job crashed')
		);
	}
}
