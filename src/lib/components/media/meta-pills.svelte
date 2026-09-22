<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { StarIcon } from '@hugeicons/core-free-icons';
	import { Badge } from '$lib/components/ui/badge';
	import type { MediaItem } from '$lib/data';
	import { resolutionLabel } from '$lib/playback-quality';
	import MediaFormatTooltip from './media-format-tooltip.svelte';

	let { item, size = 'sm' }: { item: MediaItem; size?: 'sm' | 'md' } = $props();
	const md = $derived(size === 'md');

	const yearLabel = $derived(
		item.kind === 'series' && item.endYear ? `${item.year}–${item.endYear}` : String(item.year)
	);
	const lengthLabel = $derived(
		item.kind === 'movie'
			? `${Math.floor(item.runtimeMinutes / 60)}h ${item.runtimeMinutes % 60}m`
			: `${item.seasons.length} season${item.seasons.length === 1 ? '' : 's'}`
	);
	// Source resolution of the best file; only the movie detail loader fills sourceWidth/format.
	const resolution = $derived.by(() => {
		if (item.kind !== 'movie' || !item.sourceWidth) return null;
		const label = resolutionLabel(item.sourceWidth);
		return label === '2160p' ? '4K' : label;
	});
</script>

<div
	class={[
		'flex flex-wrap items-center text-muted-foreground',
		md ? 'gap-2.5 text-base' : 'gap-2 text-sm'
	]}
>
	<span class="inline-flex items-center gap-1 font-medium text-foreground">
		<HugeiconsIcon
			icon={StarIcon}
			class="text-yellow-500 dark:text-yellow-400 {md ? 'size-5' : 'size-4'}"
		/>
		{item.rating.toFixed(1)}
	</span>
	<span>{yearLabel}</span>
	<span aria-hidden="true">·</span>
	<span>{lengthLabel}</span>
	<Badge variant="outline" class={md ? 'h-6 px-2.5 text-sm' : ''}>{item.maturity}</Badge>
	{#if item.kind === 'movie' && item.format}
		<!-- The resolution badge doubles as the trigger for the file's video/audio details. -->
		<MediaFormatTooltip
			format={item.format}
			label={resolution ?? item.format.container.toUpperCase()}
			{size}
		/>
	{:else if resolution}
		<Badge variant="outline" class={md ? 'h-6 px-2.5 text-sm' : ''}>{resolution}</Badge>
	{/if}
	{#each item.genres as genre (genre)}
		<Badge variant="secondary" class={md ? 'h-6 px-2.5 text-sm' : ''}>{genre}</Badge>
	{/each}
</div>
