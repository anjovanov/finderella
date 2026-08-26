<script lang="ts">
	import { Separator } from '$lib/components/ui/separator';
	import DetailHero from '$lib/components/media/detail-hero.svelte';
	import MediaRow from '$lib/components/media/media-row.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.movie.title} · Finderella</title>
</svelte:head>

<DetailHero item={data.movie} />

<div class="flex flex-col gap-8 py-8">
	<section class="flex page-gutter flex-col gap-3">
		<h2 class="text-lg font-semibold tracking-tight">Cast</h2>
		<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
			{#each data.movie.cast as name (name)}
				<span>{name}</span>
			{/each}
		</div>
	</section>
	{#if data.related.length > 0}
		<div class="page-gutter">
			<Separator />
		</div>
		<MediaRow title="More like this" items={data.related} />
	{/if}
</div>
