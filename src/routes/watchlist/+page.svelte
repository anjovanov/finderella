<script lang="ts">
	import LibraryPage from '$lib/components/media/library-page.svelte';

	let { data } = $props();

	const sortLabels = {
		added: 'Recently added',
		title: 'Title A–Z',
		year: 'Newest first',
		rating: 'Top rated'
	};
</script>

<svelte:head>
	<title>Watchlist · Finderella</title>
</svelte:head>

<LibraryPage
	title="Watchlist"
	items={data.items}
	genres={data.genres}
	initialQuery={data.initialQuery}
	defaultSort="added"
	{sortLabels}
	empty={{
		title: 'Your watchlist is empty',
		hint: 'Use the ⋮ menu on any title, or the Watchlist button on its page, to save it here for later.'
	}}
/>
