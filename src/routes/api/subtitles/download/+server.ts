import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { normalizeLanguage } from '@finderella/protocol';
import { sessionManager } from '$lib/server/streaming/session-manager';
import { listSubtitleTracks } from '$lib/server/streaming/subtitles';
import {
	fetchCandidate,
	installSubtitle,
	InstallError,
	recordDownloadOutcome
} from '$lib/server/subtitles/install';
import { ProviderError, type SubtitleCandidate } from '$lib/server/subtitles/providers/types';
import { titleQueryForFile } from '$lib/server/subtitles/search';
import { getSubtitleProviderSettings } from '$lib/server/subtitles/settings';

const DownloadRequest = z.object({
	sessionId: z.string().uuid(),
	provider: z.enum(['opensubtitles', 'subdl', 'gestdown', 'titlovi']),
	id: z.string().min(1),
	language: z.string().min(2).max(3),
	hearingImpaired: z.boolean().default(false),
	forced: z.boolean().default(false),
	releaseName: z.string().default(''),
	script: z.enum(['cyrillic']).optional()
});

/**
 * Download one search result for the file a playback session is showing,
 * save it beside the video on its device, and return the session's refreshed
 * track list (the new track is servable immediately).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) error(401, 'Sign in to download subtitles.');
	const parsed = DownloadRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'invalid download request');
	const language = normalizeLanguage(parsed.data.language);
	if (!language) error(400, 'unknown language');
	const session = sessionManager.get(parsed.data.sessionId);
	if (!session) error(404, 'no such playback session');
	const file = session.source.file;
	const query = await titleQueryForFile(file);
	if (!query) error(404, 'This title is missing from the catalog.');
	const settings = await getSubtitleProviderSettings();
	const candidate: SubtitleCandidate = {
		provider: parsed.data.provider,
		id: parsed.data.id,
		language,
		releaseName: parsed.data.releaseName,
		hearingImpaired: parsed.data.hearingImpaired,
		forced: parsed.data.forced,
		downloads: 0,
		rating: 0,
		trusted: false,
		aiTranslated: false,
		machineTranslated: false,
		hashMatch: false,
		script: parsed.data.script
	};
	try {
		const download = await fetchCandidate(settings, candidate, query);
		const trackId = await installSubtitle({
			file,
			candidate,
			download,
			source: 'player',
			userId: user.id
		});
		return json({ trackId, tracks: await listSubtitleTracks(file.id, session.id) });
	} catch (err) {
		if (err instanceof ProviderError) {
			const reset = err.resetAt ? ` Quota resets ${err.resetAt.toUTCString()}.` : '';
			await recordDownloadOutcome({
				file,
				language,
				status: 'failed',
				provider: err.provider,
				error: err.message,
				source: 'player',
				userId: user.id
			}).catch(() => {});
			error(err.kind === 'quota' ? 429 : 502, `${err.message}.${reset}`);
		}
		if (err instanceof InstallError) error(503, err.message);
		throw err;
	}
};
