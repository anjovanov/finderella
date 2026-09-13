<script lang="ts">
	import PosterCard from '$lib/components/media/poster-card.svelte';

	let { data } = $props();
	const count = $derived(data.items.length);
</script>

<svelte:head>
	<title>{data.q ? `“${data.q}” · Search` : 'Search'} · Finderella</title>
</svelte:head>

<div class="flex page-gutter flex-col gap-6 py-8">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">Search</h1>
		{#if data.q}
			<p class="text-sm text-muted-foreground">
				{count} result{count === 1 ? '' : 's'} for “{data.q}”
			</p>
		{/if}
	</div>
	{#if !data.q}
		<div class="flex flex-col items-center gap-2 py-24 text-center">
			<p class="text-lg font-medium">Search movies and series</p>
			<p class="max-w-md text-sm text-muted-foreground">
				Type in the search bar above — results appear as you type, even with a typo or two.
			</p>
		</div>
	{:else if count === 0}
		<div class="flex flex-col items-center gap-2 py-24 text-center">
			<p class="text-lg font-medium">No titles match “{data.q}”</p>
			<p class="max-w-md text-sm text-muted-foreground">
				Check the spelling or try a shorter query — titles, years, cast and crew all count.
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
			{#each data.items as item (`${item.kind}:${item.id}`)}
				<PosterCard {item} showKind class="w-full sm:w-full" />
			{/each}
		</div>
	{/if}
</div>
