<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Genre, MediaItem } from '$lib/data';
	import LibraryToolbar from './library-toolbar.svelte';
	import PosterCard from './poster-card.svelte';

	let {
		title,
		items,
		genres,
		defaultSort = 'title',
		sortLabels,
		empty,
		showKind = false,
		eyebrow
	}: {
		title: string;
		items: MediaItem[];
		/** Genre filter options; empty hides the genre select. */
		genres: Genre[];
		/** `title` | `year` | `release` (oldest first) | `rating` | `added` (= keep the incoming order). */
		defaultSort?: string;
		sortLabels?: Record<string, string>;
		/** Shown instead of the toolbar + grid when there are no items at all. */
		empty?: { title: string; hint: string };
		/** Mixed movie + series lists: Movie/Series badge on each card and a kind filter. */
		showKind?: boolean;
		/** Rendered above the title (back link, category label…). */
		eyebrow?: Snippet;
	} = $props();

	// Text search lives in the navbar (SearchBox → /search); this page only filters by genre.
	let genre = $state('all');
	let kind = $state('all');
	// The initial sort only; the toolbar owns it afterwards.
	// svelte-ignore state_referenced_locally
	let sort = $state(defaultSort);

	const filtered = $derived.by(() => {
		const matches = items.filter(
			(item) =>
				(genre === 'all' || item.genres.includes(genre as Genre)) &&
				(kind === 'all' || item.kind === kind)
		);
		if (sort === 'added') return matches;
		return matches.toSorted((a, b) =>
			sort === 'year'
				? b.year - a.year
				: sort === 'release'
					? a.year - b.year || a.title.localeCompare(b.title)
					: sort === 'rating'
						? b.rating - a.rating
						: a.title.localeCompare(b.title)
		);
	});
	// The kind filter only earns its place when both kinds are present.
	const mixed = $derived(
		showKind && items.some((i) => i.kind === 'movie') && items.some((i) => i.kind === 'series')
	);
</script>

<div class="flex page-gutter flex-col gap-6 py-8">
	<div class="flex flex-col gap-1">
		{@render eyebrow?.()}
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
		<LibraryToolbar bind:genre bind:sort bind:kind {genres} {sortLabels} kindFilter={mixed} />
		{#if filtered.length === 0}
			<div class="flex flex-col items-center gap-2 py-24 text-center">
				<p class="text-lg font-medium">No results</p>
				<p class="text-sm text-muted-foreground">Try a different filter.</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
				{#each filtered as item (`${item.kind}:${item.id}`)}
					<PosterCard {item} {showKind} class="w-full sm:w-full" />
				{/each}
			</div>
		{/if}
	{/if}
</div>
