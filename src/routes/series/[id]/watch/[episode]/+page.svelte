<script lang="ts">
	import { episodeWatchHref, mediaHref } from '$lib/data';
	import WatchPlayer from '$lib/components/media/watch-player.svelte';
	import {
		beaconStop,
		createProgressReporter,
		startPlayback,
		stopPlayback,
		type PlaybackDescriptor
	} from '$lib/playback-client';

	let { data } = $props();

	const episodeLabel = $derived(
		`S${data.season.number} E${data.episode.number} · ${data.episode.title}`
	);

	let playback: PlaybackDescriptor | null = $state(null);
	let playbackError: string | null = $state(null);
	let reporter: ReturnType<typeof createProgressReporter> | null = null;

	// Re-runs per episode (same route component instance is reused on
	// episode→episode navigation): stops the old session, starts a new one.
	$effect(() => {
		const slug = data.show.id;
		const episodeSlug = data.episode.id;
		playback = null;
		playbackError = null;
		const controller = new AbortController();
		let sessionId: string | null = null;
		reporter = createProgressReporter({ kind: 'series', slug, episodeSlug });

		startPlayback(
			{ kind: 'series', slug, episodeSlug, startSeconds: data.resumeFrom },
			controller.signal
		)
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
		startAt={data.resumeFrom}
		onProgress={(position, duration) => reporter?.onProgress(position, duration)}
		nextHref={data.nextEpisodeId ? episodeWatchHref(data.show.id, data.nextEpisodeId) : undefined}
		show={data.show}
		currentEpisodeId={data.episode.id}
	/>
{:else}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black">
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
