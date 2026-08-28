<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { PlayIcon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import { watchHref, type MediaItem } from '$lib/data';
	import MetaPills from './meta-pills.svelte';
	import PosterArt from './poster-art.svelte';

	let { item }: { item: MediaItem } = $props();

	const byline = $derived(
		item.kind === 'movie' ? `Directed by ${item.director}` : `Created by ${item.creator}`
	);
	// "$200M" rather than a wall of zeros.
	const budgetLabel = $derived(
		item.kind === 'movie' && item.budget
			? new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
					notation: 'compact',
					maximumFractionDigits: 1
				}).format(item.budget)
			: null
	);
</script>

<section class="relative -mt-16">
	<div class="absolute inset-0 max-h-[28rem] overflow-hidden">
		<PosterArt {item} variant="backdrop" class="aspect-auto size-full opacity-60" />
		<div class="absolute inset-0 hero-fade-b"></div>
	</div>
	<div class="relative flex page-gutter flex-col gap-6 pt-40 pb-8 sm:flex-row sm:items-end">
		<div
			class="w-56 shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-border sm:w-72 lg:w-80"
		>
			<PosterArt {item} showTitle />
		</div>
		<div class="flex max-w-2xl flex-col gap-3">
			<h1 class="text-3xl font-bold tracking-tight text-balance sm:text-5xl">{item.title}</h1>
			{#if item.tagline}
				<p class="text-muted-foreground italic">{item.tagline}</p>
			{/if}
			<MetaPills {item} />
			<p class="text-muted-foreground">{item.synopsis}</p>
			<p class="text-sm text-muted-foreground">
				{byline}
				{#if budgetLabel}
					<span aria-hidden="true">·</span> Budget {budgetLabel}
				{/if}
			</p>
			<div class="mt-1 flex gap-3">
				<Button href={watchHref(item)} size="lg">
					<HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
					Play
				</Button>
			</div>
		</div>
	</div>
</section>
