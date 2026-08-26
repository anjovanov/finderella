<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { StarIcon } from '@hugeicons/core-free-icons';
	import { Badge } from '$lib/components/ui/badge';
	import type { MediaItem } from '$lib/data';

	let { item }: { item: MediaItem } = $props();

	const yearLabel = $derived(
		item.kind === 'series' && item.endYear ? `${item.year}–${item.endYear}` : String(item.year)
	);
	const lengthLabel = $derived(
		item.kind === 'movie'
			? `${Math.floor(item.runtimeMinutes / 60)}h ${item.runtimeMinutes % 60}m`
			: `${item.seasons.length} season${item.seasons.length === 1 ? '' : 's'}`
	);
</script>

<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
	<span class="inline-flex items-center gap-1 font-medium text-foreground">
		<HugeiconsIcon icon={StarIcon} class="size-4 text-primary" />
		{item.rating.toFixed(1)}
	</span>
	<span>{yearLabel}</span>
	<span aria-hidden="true">·</span>
	<span>{lengthLabel}</span>
	<Badge variant="outline">{item.maturity}</Badge>
	{#each item.genres as genre (genre)}
		<Badge variant="secondary">{genre}</Badge>
	{/each}
</div>
