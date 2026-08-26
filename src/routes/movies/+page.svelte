<script lang="ts">
	import LibraryPage from '$lib/components/media/library-page.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Movies · Finderella</title>
</svelte:head>

<LibraryPage
	title="Movies"
	items={data.items}
	genres={data.genres}
	initialQuery={data.initialQuery}
/>
