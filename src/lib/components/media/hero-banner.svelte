<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { InformationCircleIcon, PlayIcon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import { mediaHref, watchHref, type MediaItem } from '$lib/data';
	import MetaPills from './meta-pills.svelte';
	import PosterArt from './poster-art.svelte';

	let { item }: { item: MediaItem } = $props();
</script>

<section class="relative -mt-16 min-h-[70vh] w-full">
	<PosterArt {item} variant="backdrop" class="absolute inset-0 aspect-auto size-full" />
	<div class="absolute inset-0 hero-fade-b"></div>
	<div class="absolute inset-0 hero-fade-l"></div>
	<div
		class="relative flex min-h-[70vh] max-w-2xl page-gutter flex-col justify-end gap-4 pt-32 pb-12"
	>
		<span class="text-xs font-medium tracking-[0.3em] text-primary uppercase">
			Featured {item.kind === 'movie' ? 'movie' : 'series'}
		</span>
		<h1 class="text-4xl font-bold tracking-tight text-balance sm:text-6xl">{item.title}</h1>
		{#if item.tagline}
			<p class="text-lg text-muted-foreground italic">{item.tagline}</p>
		{/if}
		<MetaPills {item} />
		<p class="line-clamp-2 max-w-xl text-muted-foreground">{item.synopsis}</p>
		<div class="mt-2 flex gap-3">
			<Button href={watchHref(item)} size="lg">
				<HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
				Play
			</Button>
			<Button href={mediaHref(item)} variant="secondary" size="lg">
				<HugeiconsIcon icon={InformationCircleIcon} data-icon="inline-start" />
				More info
			</Button>
		</div>
	</div>
</section>
