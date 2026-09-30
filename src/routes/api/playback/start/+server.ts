import { error, json, type RequestHandler } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { mediaAudio } from '$lib/server/db/schema';
import { registry } from '$lib/server/gateways/registry';
import {
	audioLabel,
	directPlayAudio,
	transcodeAudio,
	pickAudioTrack,
	toAudioTracks,
	type AudioRow
} from '$lib/server/streaming/audio';
import { SEGMENT_SECONDS } from '$lib/server/streaming/hls-playlist';
import { sessionManager, type HotSession } from '$lib/server/streaming/session-manager';
import { listSubtitleTracks } from '$lib/server/streaming/subtitles';
import { playbackMarkers } from '$lib/server/markers';
import type { PlayableSource } from '$lib/server/streaming/source-picker';
import {
	canTrickplay,
	ensureTrickplay,
	trickplayVttSrc,
	usableGeometry
} from '$lib/server/trickplay/ensure';
import { loginRequired, remuxEnabled, trickplayEnabled } from '$lib/server/site-settings';
import { pickEpisodeSource, pickMovieSource } from '$lib/server/streaming/source-picker';
import { QUALITY_IDS, QUALITY_LADDER, transcodePlan } from '$lib/playback-quality';
import { requireProfile } from '$lib/server/profiles';
import {
	REMUX_AUDIO_CODECS,
	REMUX_AUDIO_ENCODERS,
	REMUX_VIDEO_CODECS,
	remuxPlan
} from '$lib/data/remux';

/**
 * Playback start must not wait on thumbnails: the device answers from its
 * cache in milliseconds, or from one ffprobe when it has to start a job; a
 * cold NAS that takes longer than this only costs that session its previews.
 */
const TRICKPLAY_ENSURE_TIMEOUT_MS = 2_000;

/**
 * Kick off (or look up) the file's sprite sheets on its device and remember
 * the layout on the session so /api/stream/<id>/trickplay/* can serve them.
 * Null = no thumbnails for this session (switched off, old gateway, no duration, timeout).
 */
async function attachTrickplay(
	session: HotSession,
	source: PlayableSource
): Promise<{ vttSrc: string } | null> {
	if (!(await trickplayEnabled())) return null;
	if (!canTrickplay(registry.get(source.gatewayId), source.file)) return null;
	const geometry = usableGeometry(
		await ensureTrickplay(source, 'high', TRICKPLAY_ENSURE_TIMEOUT_MS)
	);
	if (!geometry) return null;
	sessionManager.setTrickplay(session.id, geometry);
	return { vttSrc: trickplayVttSrc(session.id) };
}

const StartRequest = z.object({
	kind: z.enum(['movie', 'series']),
	slug: z.string().min(1),
	episodeSlug: z.string().min(1).optional(),
	startSeconds: z.number().nonnegative().default(0),
	quality: z.enum(QUALITY_IDS).default('original'),
	/** An explicit pick from the player's audio menu (a media_audio id; ignored when it isn't this file's). */
	audioTrackId: z.string().min(1).nullish(),
	/** The viewer's preferred audio language: 'default' or an ISO 639-1 code. */
	audioLanguage: z.string().min(1).optional(),
	/** Most channels the viewer wants (audio-channels setting); transcodes are encoded down to it. */
	maxAudioChannels: z.union([z.literal(1), z.literal(2), z.literal(6)]).default(2),
	/** What the browser can remux (see $lib/data/remux); absent = never remux (older clients). */
	capabilities: z
		.object({
			video: z.array(z.enum(REMUX_VIDEO_CODECS)),
			audio: z.array(z.enum(REMUX_AUDIO_CODECS)),
			encode: z.array(z.enum(REMUX_AUDIO_ENCODERS)),
			surround: z.array(z.enum(REMUX_AUDIO_ENCODERS)).default([])
		})
		.nullish(),
	/** false after a remux failed in this browser: go straight to the transcoder. */
	allowRemux: z.boolean().default(true)
});

/**
 * The file's audio streams — only when its device can honour a pick, so an
 * old gateway (always the first stream) never shows a menu it would ignore.
 */
async function loadAudioRows(source: PlayableSource): Promise<AudioRow[]> {
	if (!registry.get(source.gatewayId)?.capabilities.audioSelect) return [];
	return db.query.mediaAudio.findMany({
		where: eq(mediaAudio.mediaFileId, source.file.id),
		orderBy: asc(mediaAudio.streamIndex)
	});
}

/**
 * Create a playback session for a title and return what the player should
 * load. Modes:
 *  - direct: browser-compatible file on an online gateway → range proxy
 *  - remux:  a file whose codecs the browser decodes but whose container
 *            (MKV, …) or audio (AC-3, a non-first track) it can't play as-is
 *            → the same range proxy; the browser re-wraps it into
 *            fragmented MP4 for Media Source Extensions ($lib/remux)
 *  - hls:    anything else → ffmpeg on the gateway, hub-synthesized playlists
 * An explicit `quality` rung forces hls, capped to that rung (see
 * $lib/playback-quality) — the way to fit a remote gateway's uplink.
 * Error bodies are shown verbatim by the watch pages, so keep them readable.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const userAgent = request.headers.get('user-agent');
	const user = locals.user ?? null;
	// hooks.server.ts already answers 401 when an account is required; this is
	// the defensive check for guest mode being switched off mid-session.
	if (!user && (await loginRequired())) error(401, 'Sign in to watch.');
	const viewerId = user?.id ?? null;
	// Signed in but no profile picked yet (several on the account): 409.
	const profile = user ? requireProfile(locals) : null;
	const viewerProfile = profile ? { id: profile.id, name: profile.name } : null;
	const parsed = StartRequest.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'expected { kind, slug, episodeSlug? }');
	const {
		kind,
		slug,
		episodeSlug,
		startSeconds,
		quality,
		audioTrackId,
		audioLanguage,
		maxAudioChannels,
		capabilities,
		allowRemux
	} = parsed.data;
	const rung = quality === 'original' ? undefined : QUALITY_LADDER[quality];
	if (kind === 'series' && !episodeSlug) error(400, 'episodeSlug required for series');

	const lookup =
		kind === 'movie' ? await pickMovieSource(slug) : await pickEpisodeSource(slug, episodeSlug!);
	if (!lookup.source) {
		if (lookup.reason === 'offline') {
			error(503, 'The device holding this title is offline right now.');
		}
		error(
			404,
			'No media file is linked to this title. Add it to a library on a device and rescan.'
		);
	}
	const source = lookup.source;

	const audioRows = await loadAudioRows(source);
	const audio = pickAudioTrack(audioRows, { trackId: audioTrackId, language: audioLanguage });
	const audioFields = { audioTracks: toAudioTracks(audioRows), audioTrackId: audio?.id ?? null };
	// Browsers play the first audio stream of a direct-play file and can't
	// switch; any other stream goes through the transcoder.
	const directAudio = !audio || audio.id === directPlayAudio(audioRows)?.id;
	const chosenAudioLabel = audio ? audioLabel(audio, audioRows.indexOf(audio)) : null;

	const direct = source.directPlayable && !rung && directAudio;
	// Remux: the original file, re-wrapped by the browser — any audio track,
	// no device CPU. Only at Original quality (a rung needs a real re-encode).
	// Old gateways without a track list play the first stream: vet that one.
	// A surround viewer whose 5.1 track the browser can only convert to stereo
	// gets the transcoder instead (remuxPlan answers null): it outputs 5.1.
	const remuxAudio = audio
		? { codec: audio.codec, channels: audio.channels }
		: source.file.audioCodec
			? { codec: source.file.audioCodec, channels: null }
			: null;
	const remux =
		!direct && !rung && allowRemux && (await remuxEnabled())
			? remuxPlan(source.file, remuxAudio, capabilities, maxAudioChannels)
			: null;

	if (direct || remux) {
		const session = await sessionManager.start(
			viewerId,
			source,
			remux ? 'remux' : 'direct',
			quality,
			{
				startSeconds,
				userAgent,
				profile: viewerProfile,
				details: {
					audioLabel: chosenAudioLabel,
					remuxAudio: remux?.audioAction,
					audioChannels: remux?.audioChannels ?? undefined
				}
			}
		);
		const [subtitles, trickplay, markers] = await Promise.all([
			listSubtitleTracks(source.file.id, session.id),
			attachTrickplay(session, source),
			playbackMarkers(source.file)
		]);
		return json({
			mode: remux ? 'remux' : 'direct',
			src: `/api/stream/${session.id}/file`,
			sessionId: session.id,
			quality,
			source: { width: source.file.width, height: source.file.height },
			subtitles,
			trickplay,
			markers,
			// The browser picks the stream by its position among the file's
			// audio streams (null = the first one).
			remux: remux
				? {
						audioOrdinal: audio ? audioRows.indexOf(audio) : null,
						audioChannels: remux.audioChannels
					}
				: null,
			...audioFields
		});
	}

	// HLS transcode path: ffmpeg runs on the gateway that owns the file.
	const connected = registry.get(source.gatewayId);
	if (!connected?.capabilities.ffmpeg) {
		error(
			501,
			`"${source.file.relPath}" needs transcoding, but the device holding it has no ffmpeg`
		);
	}
	if (!source.file.durationMs) {
		error(
			501,
			`"${source.file.relPath}" needs transcoding, but was scanned without ffprobe (no duration) — install ffprobe on the device and rescan`
		);
	}

	const plan = transcodePlan(quality, source.file.width);
	const audioOut = transcodeAudio(maxAudioChannels, audio?.channels, plan.audioKbps);
	const session = await sessionManager.start(viewerId, source, 'hls', quality, {
		audioKbps: audioOut.kbps,
		startSeconds,
		userAgent,
		profile: viewerProfile,
		details: {
			audioLabel: chosenAudioLabel,
			audioChannels: audioOut.channels,
			streamWidth: Math.min(plan.maxWidth, source.file.width || plan.maxWidth)
		}
	});
	// In flight alongside session.start; never awaited before the transcode is up.
	const trickplayPending = attachTrickplay(session, source);
	try {
		await registry.request(
			source.gatewayId,
			{
				type: 'session.start',
				sessionId: session.id,
				rootPath: source.rootPath,
				relPath: source.file.relPath,
				startSeconds,
				segmentSeconds: SEGMENT_SECONDS,
				durationMs: source.file.durationMs,
				quality: {
					maxWidth: plan.maxWidth,
					maxVideoKbps: plan.maxVideoKbps,
					audioKbps: audioOut.kbps,
					level: plan.level
				},
				audioStreamIndex: audio?.streamIndex,
				audioChannels: audioOut.channels
			},
			{ timeoutMs: 15_000 }
		);
	} catch (err) {
		await sessionManager.stop(session.id, 'error');
		error(502, `device failed to start transcoding: ${(err as Error).message}`);
	}
	const [subtitles, trickplay, markers] = await Promise.all([
		listSubtitleTracks(source.file.id, session.id),
		trickplayPending,
		playbackMarkers(source.file)
	]);
	return json({
		mode: 'hls',
		src: `/api/stream/${session.id}/hls/master.m3u8`,
		sessionId: session.id,
		quality,
		source: { width: source.file.width, height: source.file.height },
		subtitles,
		trickplay,
		markers,
		remux: null,
		...audioFields
	});
};
