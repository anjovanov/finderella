<script lang="ts">
	import { mediaHref } from '$lib/data';
	import WatchPlayer from '$lib/components/media/watch-player.svelte';
	import {
		beaconStop,
		createProgressReporter,
		startPlayback,
		stopPlayback,
		type PlaybackDescriptor
	} from '$lib/playback-client';
	import { loadStoredQuality, storeQuality, type QualityId } from '$lib/playback-quality';

	let { data } = $props();

	let playback: PlaybackDescriptor | null = $state(null);
	let playbackError: string | null = $state(null);
	let reporter: ReturnType<typeof createProgressReporter> | null = null;
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

	$effect(() => {
		const slug = data.movie.id;
		const chosenQuality = quality;
		const startSeconds = restartAt ?? data.resumeFrom;
		restartAt = null;
		playbackStartAt = startSeconds;
		playback = null;
		playbackError = null;
		const controller = new AbortController();
		sessionId = null;
		reporter = createProgressReporter({ kind: 'movie', slug });

		startPlayback({ kind: 'movie', slug, startSeconds, quality: chosenQuality }, controller.signal)
			.then((descriptor) => {
				sessionId = descriptor.sessionId;
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
			reporter?.flush();
			stopPlayback(sessionId);
		};
	});

	// The player can't buffer its way out of a fatal error: drop the session
	// and show the reason in the same panel /api/playback/start failures use.
	function onPlaybackError(message: string) {
		reporter?.flush();
		stopPlayback(sessionId);
		sessionId = null;
		playback = null;
		playbackError = message;
	}
</script>

<svelte:head>
	<title>Watch {data.movie.title} · Finderella</title>
</svelte:head>

{#if playback}
	<WatchPlayer
		title={data.movie.title}
		backHref={mediaHref(data.movie)}
		videoSrc={playback.src}
		videoKind={playback.mode === 'hls' ? 'hls' : 'file'}
		startAt={playbackStartAt}
		onProgress={(position, duration) => {
			lastPosition = position;
			reporter?.onProgress(position, duration);
		}}
		onError={onPlaybackError}
		{quality}
		sourceWidth={playback.source.width}
		onQualityChange={changeQuality}
	/>
{:else}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black">
		{#if playbackError}
			<div class="flex max-w-md flex-col items-center gap-4 px-6 text-center">
				<p class="text-lg font-medium text-white">Can't play this right now</p>
				<p class="text-sm text-white/70">{playbackError}</p>
				<!-- mediaHref() returns resolve()d paths -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={mediaHref(data.movie)} class="text-sm text-primary hover:underline">
					Back to {data.movie.title}
				</a>
			</div>
		{:else}
			<p class="text-sm text-white/60">Preparing playback…</p>
		{/if}
	</div>
{/if}
