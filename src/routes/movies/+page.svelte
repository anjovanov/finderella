<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import LibraryPage from '$lib/components/media/library-page.svelte';

	let { data } = $props();
</script>

<PageTitle title="Movies" />

<LibraryPage title="Movies" items={data.items} genres={data.genres} />
