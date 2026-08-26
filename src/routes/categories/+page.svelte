<script lang="ts">
	import MediaRow from '$lib/components/media/media-row.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Categories · Finderella</title>
</svelte:head>

<div class="flex flex-col gap-10 py-8">
	<div class="flex page-gutter flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">Categories</h1>
		<p class="text-sm text-muted-foreground">Browse every movie and series by genre.</p>
	</div>
	{#each data.categories as category (category.genre)}
		<MediaRow title={category.genre} items={category.items} />
	{/each}
</div>
