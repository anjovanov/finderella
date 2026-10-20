<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
	import LibraryPage from '$lib/components/media/library-page.svelte';
	import { allGenres } from '$lib/data';
	import { genreLabel } from '$lib/data/genres';

	let { data } = $props();

	// A genre page is named by the stored English genre.
	const name = $derived(data.type === 'genres' ? genreLabel(data.name) : data.name);

	// A collection reads best in release order; a genre page filtering by genre is moot.
	const sortLabels = $derived(
		data.type === 'collections'
			? { release: 'Release order', year: 'Newest first', title: 'Title A–Z', rating: 'Top rated' }
			: undefined
	);
</script>

<PageTitle title={name} />

{#key `${data.type}/${data.slug}`}
	<LibraryPage
		title={name}
		items={data.items}
		genres={data.type === 'genres' ? [] : allGenres(data.items)}
		defaultSort={data.type === 'collections' ? 'release' : 'title'}
		{sortLabels}
		showKind={data.type !== 'collections'}
	>
		{#snippet eyebrow()}
			<a
				href={resolve('/categories')}
				class="flex w-fit items-center gap-1 text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-primary"
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} class="size-3.5" />
				Categories
			</a>
		{/snippet}
	</LibraryPage>
{/key}
