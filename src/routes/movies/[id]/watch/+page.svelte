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

	let { data } = $props();

	let playback: PlaybackDescriptor | null = $state(null);
	let playbackError: string | null = $state(null);
	let reporter: ReturnType<typeof createProgressReporter> | null = null;

	$effect(() => {
		const slug = data.movie.id;
		playback = null;
		playbackError = null;
		const controller = new AbortController();
		let sessionId: string | null = null;
		reporter = createProgressReporter({ kind: 'movie', slug });

		startPlayback({ kind: 'movie', slug, startSeconds: data.resumeFrom }, controller.signal)
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
	<title>Watch {data.movie.title} · Finderella</title>
</svelte:head>

{#if playback}
	<WatchPlayer
		title={data.movie.title}
		backHref={mediaHref(data.movie)}
		videoSrc={playback.src}
		videoKind={playback.mode === 'hls' ? 'hls' : 'file'}
		startAt={data.resumeFrom}
		onProgress={(position, duration) => reporter?.onProgress(position, duration)}
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
