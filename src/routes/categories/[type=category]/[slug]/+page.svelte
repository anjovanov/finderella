<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
	import LibraryPage from '$lib/components/media/library-page.svelte';
	import { allGenres } from '$lib/data';

	let { data } = $props();

	const LABELS = { genres: 'Genre', collections: 'Collection', networks: 'Network & studio' };

	// A collection reads best in release order; a genre page filtering by genre is moot.
	const sortLabels = $derived(
		data.type === 'collections'
			? { release: 'Release order', year: 'Newest first', title: 'Title A–Z', rating: 'Top rated' }
			: undefined
	);
</script>

<PageTitle title={data.name} />

{#key `${data.type}/${data.slug}`}
	<LibraryPage
		title={data.name}
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
				Categories · {LABELS[data.type]}
			</a>
		{/snippet}
	</LibraryPage>
{/key}
