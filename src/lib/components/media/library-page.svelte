<script lang="ts">
	import type { Genre, MediaItem } from '$lib/data';
	import LibraryToolbar from './library-toolbar.svelte';
	import PosterCard from './poster-card.svelte';

	let {
		title,
		items,
		genres,
		initialQuery = '',
		defaultSort = 'title',
		sortLabels,
		empty
	}: {
		title: string;
		items: MediaItem[];
		genres: Genre[];
		initialQuery?: string;
		/** `title` | `year` | `rating` | `added` (= keep the incoming order). */
		defaultSort?: string;
		sortLabels?: Record<string, string>;
		/** Shown instead of the toolbar + grid when there are no items at all. */
		empty?: { title: string; hint: string };
	} = $props();

	// Search comes from the nav bar via the URL's ?q= (see site-header.svelte).
	const query = $derived(initialQuery);
	let genre = $state('all');
	// The initial sort only; the toolbar owns it afterwards.
	// svelte-ignore state_referenced_locally
	let sort = $state(defaultSort);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const matches = items.filter(
			(item) =>
				(!q || item.title.toLowerCase().includes(q)) &&
				(genre === 'all' || item.genres.includes(genre as Genre))
		);
		if (sort === 'added') return matches;
		return matches.toSorted((a, b) =>
			sort === 'year'
				? b.year - a.year
				: sort === 'rating'
					? b.rating - a.rating
					: a.title.localeCompare(b.title)
		);
	});
</script>

<div class="flex page-gutter flex-col gap-6 py-8">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">{title}</h1>
		<p class="text-sm text-muted-foreground">
			{filtered.length} of {items.length} titles
		</p>
	</div>
	{#if items.length === 0 && empty}
		<div class="flex flex-col items-center gap-2 py-24 text-center">
			<p class="text-lg font-medium">{empty.title}</p>
			<p class="max-w-md text-sm text-muted-foreground">{empty.hint}</p>
		</div>
	{:else}
		<LibraryToolbar bind:genre bind:sort {genres} {sortLabels} />
		{#if filtered.length === 0}
			<div class="flex flex-col items-center gap-2 py-24 text-center">
				<p class="text-lg font-medium">No results</p>
				<p class="text-sm text-muted-foreground">Try a different search or clear the filters.</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
				{#each filtered as item (item.id)}
					<PosterCard {item} class="w-full sm:w-full" />
				{/each}
			</div>
		{/if}
	{/if}
</div>
