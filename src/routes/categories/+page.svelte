<script lang="ts">
	import CategoryTile from '$lib/components/media/category-tile.svelte';

	let { data } = $props();

	const sections = $derived(
		[
			{ key: 'genres', title: 'Genres', tiles: data.index.genres },
			{ key: 'collections', title: 'Collections', tiles: data.index.collections },
			{ key: 'networks', title: 'Networks & Studios', tiles: data.index.networks }
		].filter((s) => s.tiles.length > 0)
	);
</script>

<svelte:head>
	<title>Categories · Finderella</title>
</svelte:head>

<div class="flex page-gutter flex-col gap-10 py-8">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">Categories</h1>
		<p class="text-sm text-muted-foreground">
			Browse by genre, collection, or the network and studio behind it.
		</p>
	</div>
	{#each sections as section (section.key)}
		<section class="flex flex-col gap-4" aria-labelledby="section-{section.key}">
			<h2 id="section-{section.key}" class="text-xl font-semibold tracking-tight">
				{section.title}
			</h2>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{#each section.tiles as tile (tile.slug)}
					<CategoryTile {tile} />
				{/each}
			</div>
		</section>
	{:else}
		<div class="flex flex-col items-center gap-2 py-24 text-center">
			<p class="text-lg font-medium">Nothing to browse yet</p>
			<p class="max-w-md text-sm text-muted-foreground">
				Categories appear once your libraries are scanned and titles have metadata.
			</p>
		</div>
	{/each}
</div>
