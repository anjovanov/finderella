<script lang="ts">
	import { onDestroy } from 'svelte';
	import { episodeWatchHref, mediaHref } from '$lib/data';
	import WatchPlayer from '$lib/components/media/watch-player.svelte';
	import { exitFullscreen } from '$lib/fullscreen';
	import { lockPageScroll } from '$lib/scroll-lock';
	import {
		beaconStop,
		createHeartbeat,
		createProgressReporter,
		startPlayback,
		stopPlayback,
		type PlaybackDescriptor
	} from '$lib/playback-client';
	import { loadStoredQuality, storeQuality, type QualityId } from '$lib/playback-quality';
	import {
		DEFAULT_AUDIO_LANGUAGE,
		loadAudioPreference,
		preferenceForAudioTrack,
		saveAudioLanguage,
		storeAudioPreference
	} from '$lib/audio-preference';
	import type { AudioTrack } from '$lib/data';
	import {
		DEFAULT_PLAYBACK_SETTINGS,
		stillWatchingDueForEpisode
	} from '$lib/data/playback-settings';
	import { loadGuestAutoplay, saveAutoplayNext } from '$lib/playback-preference';

	let { data } = $props();

	// The player fullscreens the document so a session restart keeps it; leaving
	// the watch page (Back, "Back to browse") must not carry it to the next page.
	onDestroy(exitFullscreen);
	// For the page's lifetime, not the player's: it unmounts between sessions.
	$effect(lockPageScroll);

	const episodeLabel = $derived(
		`S${data.season.number} E${data.episode.number} · ${data.episode.title}`
	);

	let playback: PlaybackDescriptor | null = $state(null);
	let playbackError: string | null = $state(null);
	let reporter: ReturnType<typeof createProgressReporter> | null = null;
	let heartbeat: ReturnType<typeof createHeartbeat> | null = null;
	let sessionId: string | null = null;

	// Quality is a session-level choice: switching restarts playback at the
	// current position (the effect below re-runs on `quality`).
	let quality: QualityId = $state(loadStoredQuality());
	let playbackStartAt = $state(0);
	let lastPosition = 0;
	let restartAt: number | null = null;

	function changeQuality(next: QualityId) {
		if (next === quality) return;
		storeQuality(next);
		restartAt = lastPosition;
		quality = next;
	}

	// Account settings, or the defaults for guests (whose autoplay is per browser).
	const playbackSettings = $derived(data.playbackSettings ?? DEFAULT_PLAYBACK_SETTINGS);
	let autoplayNext = $derived(data.playbackSettings?.autoplayNext ?? loadGuestAutoplay());

	function changeAutoplay(next: boolean) {
		autoplayNext = next;
		saveAutoplayNext(next, data.playbackSettings !== null);
	}

	// "Still watching?": episodes that autoplayed in a row with no input. This
	// page component survives episode→episode navigation, so the count does too;
	// the player reads `stillWatchingDue` when it mounts for the next episode.
	let autoAdvances = $state(0);

	function onInteraction() {
		if (autoAdvances !== 0) autoAdvances = 0;
	}

	// Audio works the same way: a pick restarts the session with that stream.
	// Keyed by episode — the next episode's file has its own tracks, and the
	// remembered language picks the matching one there.
	let audioPick: { episodeId: string; trackId: string } | null = $state(null);
	// This page's latest pick wins over the loader's copy (saved in the background).
	let pickedLanguage: string | null = null;

	function changeAudio(track: AudioTrack) {
		if (track.id === playback?.audioTrackId) return;
		const language = preferenceForAudioTrack(track);
		if (language) {
			pickedLanguage = language;
			storeAudioPreference(language);
			if (data.audioLanguage !== null) void saveAudioLanguage(language);
		}
		restartAt = lastPosition;
		audioPick = { episodeId: data.episode.id, trackId: track.id };
	}

	// Re-runs per episode (same route component instance is reused on
	// episode→episode navigation): stops the old session, starts a new one.
	$effect(() => {
		const slug = data.show.id;
		const episodeSlug = data.episode.id;
		const chosenQuality = quality;
		const chosenAudio = audioPick?.episodeId === episodeSlug ? audioPick.trackId : null;
		const audioLanguage =
			pickedLanguage ?? data.audioLanguage ?? loadAudioPreference() ?? DEFAULT_AUDIO_LANGUAGE;
		const audioChannels = playbackSettings.audioChannels;
		const startSeconds = restartAt ?? data.resumeFrom;
		restartAt = null;
		playbackStartAt = startSeconds;
		playback = null;
		playbackError = null;
		const controller = new AbortController();
		sessionId = null;
		reporter = createProgressReporter({ kind: 'series', slug, episodeSlug });

		startPlayback(
			{
				kind: 'series',
				slug,
				episodeSlug,
				startSeconds,
				quality: chosenQuality,
				audioTrackId: chosenAudio,
				audioLanguage,
				audioChannels
			},
			controller.signal
		)
			.then((descriptor) => {
				sessionId = descriptor.sessionId;
				heartbeat = createHeartbeat(descriptor.sessionId, onPlaybackError);
				playback = descriptor;
			})
			.catch((err: Error) => {
				if (!controller.signal.aborted) playbackError = err.message;
			});

		const onPageHide = () => {
			reporter?.flush(true);
			beaconStop(sessionId);
		};
		window.addEventListener('pagehide', onPageHide);
		return () => {
			window.removeEventListener('pagehide', onPageHide);
			controller.abort();
			heartbeat?.dispose();
			heartbeat = null;
			reporter?.flush();
			stopPlayback(sessionId);
		};
	});

	// The player can't buffer its way out of a fatal error: drop the session
	// and show the reason in the same panel /api/playback/start failures use.
	function onPlaybackError(message: string) {
		heartbeat?.dispose();
		heartbeat = null;
		reporter?.flush();
		stopPlayback(sessionId);
		sessionId = null;
		playback = null;
		playbackError = message;
	}
</script>

<svelte:head>
	<title>Watch {data.show.title} {episodeLabel} · Finderella</title>
</svelte:head>

{#if playback}
	<WatchPlayer
		title={data.show.title}
		subtitle={episodeLabel}
		backHref={mediaHref(data.show)}
		videoSrc={playback.src}
		videoKind={playback.mode === 'hls' ? 'hls' : 'file'}
		monoDownmix={playbackSettings.audioChannels === 'mono'}
		startAt={playbackStartAt}
		onProgress={(position, duration) => {
			lastPosition = position;
			reporter?.onProgress(position, duration);
			heartbeat?.update({ positionSeconds: position, durationSeconds: duration });
		}}
		onPlaybackState={(snapshot) => heartbeat?.update(snapshot)}
		onError={onPlaybackError}
		{quality}
		sourceWidth={playback.source.width}
		onQualityChange={changeQuality}
		audioTracks={playback.audioTracks}
		audioTrackId={playback.audioTrackId}
		onAudioChange={changeAudio}
		tracks={playback.subtitles}
		subtitleSettings={data.subtitleSettings}
		subtitleTarget={{ kind: 'series', slug: data.show.id, episodeSlug: data.episode.id }}
		sessionId={playback.sessionId}
		canFindSubtitles={data.canFindSubtitles}
		trickplaySrc={playback.trickplay?.vttSrc ?? null}
		onSubtitlesChanged={(tracks) => {
			// In place: replacing the object would re-source the player's video.
			if (playback) playback.subtitles = tracks;
		}}
		nextHref={data.nextEpisodeId ? episodeWatchHref(data.show.id, data.nextEpisodeId) : undefined}
		{autoplayNext}
		onAutoplayChange={changeAutoplay}
		onAutoAdvance={() => autoAdvances++}
		{onInteraction}
		stillWatchingDue={stillWatchingDueForEpisode(autoAdvances, playbackSettings.stillWatching)}
		show={data.show}
		currentEpisodeId={data.episode.id}
	/>
{:else}
	<div class="dark fixed inset-0 z-50 flex items-center justify-center bg-black">
		{#if playbackError}
			<div class="flex max-w-md flex-col items-center gap-4 px-6 text-center">
				<p class="text-lg font-medium text-white">Can't play this right now</p>
				<p class="text-sm text-white/70">{playbackError}</p>
				<!-- mediaHref() returns resolve()d paths -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={mediaHref(data.show)} class="text-sm text-primary hover:underline">
					Back to {data.show.title}
				</a>
			</div>
		{:else}
			<p class="text-sm text-white/60">Preparing playback…</p>
		{/if}
	</div>
{/if}
