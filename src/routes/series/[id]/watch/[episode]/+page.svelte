<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { episodeWatchHref, mediaHref } from '$lib/data';
	import WatchPlayer from '$lib/components/media/watch-player.svelte';
	import { exitFullscreen } from '$lib/fullscreen';
	import { lockPageScroll } from '$lib/scroll-lock';
	import {
		beaconStop,
		createHeartbeat,
		createProgressReporter,
		playerKind,
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
	import { partySkipMode } from '$lib/data/together';
	import { WatchParty } from '$lib/together/watch-party.svelte';
	import InviteDialog from '$lib/components/together/invite-dialog.svelte';
	import PartyMessage from '$lib/components/together/party-message.svelte';

	let { data } = $props();

	// The player fullscreens the document so a session restart keeps it; leaving
	// the watch page (Back, "Back to browse") must not carry it to the next page.
	onDestroy(exitFullscreen);
	// For the page's lifetime, not the player's: it unmounts between sessions.
	$effect(lockPageScroll);

	const episodeLabel = $derived(
		`S${data.season.number} E${data.episode.number} · ${data.episode.title}`
	);

	// Watch together: `?party=<code>` joins that party. The group moves between
	// episodes together: the room's episode change navigates this page, and this
	// page landing on another episode (autoplay, Next, the episodes panel — their
	// links keep `?party=`) tells the room.
	const party = new WatchParty((media) => {
		if (media.kind !== 'series') return;
		/* eslint-disable-next-line svelte/no-navigation-without-resolve -- episodeWatchHref() is resolve()d */
		void goto(party.href(episodeWatchHref(media.slug, media.episodeSlug)));
	});

	$effect(() => {
		const session = party.session;
		const media = { kind: 'series' as const, slug: data.show.id, episodeSlug: data.episode.id };
		const label = episodeLabel;
		untrack(() => session?.setPageMedia(media, label));
	});

	async function watchTogether() {
		try {
			await party.start({
				kind: 'series',
				slug: data.show.id,
				episodeSlug: data.episode.id,
				positionSeconds: lastPosition,
				playing
			});
		} catch (err) {
			party.message = (err as Error).message;
		}
	}

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
	let playing = false;
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

	// A remux this browser turned out unable to play: the episode restarts as a
	// transcode at the same position. Per episode — the next one tries again.
	let remuxBlockedFor: string | null = $state(null);

	function onRemuxFailed(position: number, reason: string) {
		console.warn(`[remux] falling back to transcoding: ${reason}`);
		restartAt = position;
		remuxBlockedFor = data.episode.id;
	}

	// Re-runs per episode (same route component instance is reused on
	// episode→episode navigation): stops the old session, starts a new one.
	$effect(() => {
		// Joining by link: start where the party is, once we know where that is.
		if (party.awaiting) return;
		const slug = data.show.id;
		const episodeSlug = data.episode.id;
		const allowRemux = remuxBlockedFor !== episodeSlug;
		const chosenQuality = quality;
		const chosenAudio = audioPick?.episodeId === episodeSlug ? audioPick.trackId : null;
		const audioLanguage =
			pickedLanguage ?? data.audioLanguage ?? loadAudioPreference() ?? DEFAULT_AUDIO_LANGUAGE;
		const audioChannels = playbackSettings.audioChannels;
		const partyAt = untrack(() => (party.session?.joined ? party.session.positionNow() : null));
		const startSeconds = restartAt ?? partyAt ?? data.resumeFrom;
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
				audioChannels,
				allowRemux
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

<PageTitle title={`Watch ${data.show.title} ${episodeLabel}`} />

{#if playback}
	<WatchPlayer
		title={data.show.title}
		subtitle={episodeLabel}
		backHref={mediaHref(data.show)}
		videoSrc={playback.src}
		videoKind={playerKind(playback.mode)}
		remux={playback.remux}
		{onRemuxFailed}
		monoDownmix={playbackSettings.audioChannels === 'mono'}
		startAt={playbackStartAt}
		onProgress={(position, duration) => {
			lastPosition = position;
			reporter?.onProgress(position, duration);
			heartbeat?.update({ positionSeconds: position, durationSeconds: duration });
		}}
		onPlaybackState={(snapshot) => {
			if (snapshot.state) playing = snapshot.state === 'playing';
			heartbeat?.update(snapshot);
		}}
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
		markers={playback.markers}
		skipIntro={party.code ? partySkipMode(playbackSettings.skipIntro) : playbackSettings.skipIntro}
		skipCredits={party.code
			? partySkipMode(playbackSettings.skipCredits)
			: playbackSettings.skipCredits}
		onSubtitlesChanged={(tracks) => {
			// In place: replacing the object would re-source the player's video.
			if (playback) playback.subtitles = tracks;
		}}
		nextHref={data.nextEpisodeId
			? party.href(episodeWatchHref(data.show.id, data.nextEpisodeId))
			: undefined}
		episodeHref={(episodeId) => party.href(episodeWatchHref(data.show.id, episodeId))}
		{autoplayNext}
		onAutoplayChange={changeAutoplay}
		onAutoAdvance={() => autoAdvances++}
		{onInteraction}
		stillWatchingDue={!party.code &&
			stillWatchingDueForEpisode(autoAdvances, playbackSettings.stillWatching)}
		show={data.show}
		currentEpisodeId={data.episode.id}
		party={party.session}
		onInvite={() => (party.inviteOpen = true)}
		onLeaveParty={() => party.leave()}
		onWatchTogether={data.canWatchTogether ? watchTogether : undefined}
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
			<p class="text-sm text-white/60">
				{party.awaiting ? 'Joining the watch party…' : 'Preparing playback…'}
			</p>
		{/if}
	</div>
{/if}

{#if party.code}
	<InviteDialog code={party.code} bind:open={party.inviteOpen} />
{/if}
<PartyMessage message={party.message} />
