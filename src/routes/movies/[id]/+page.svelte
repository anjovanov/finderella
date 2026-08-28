<script lang="ts">
	import { Separator } from '$lib/components/ui/separator';
	import DetailHero from '$lib/components/media/detail-hero.svelte';
	import MediaRow from '$lib/components/media/media-row.svelte';
	import CastRow from '$lib/components/media/cast-row.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.movie.title} · Finderella</title>
</svelte:head>

<DetailHero item={data.movie} />

<div class="flex flex-col gap-8 py-8">
	{#if data.movie.cast.length > 0}
		<CastRow cast={data.movie.cast} />
	{/if}
	{#if data.related.length > 0}
		<div class="page-gutter">
			<Separator />
		</div>
		<MediaRow title="More like this" items={data.related} />
	{/if}
</div>
