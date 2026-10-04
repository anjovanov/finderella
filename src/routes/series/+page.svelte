<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import LibraryPage from '$lib/components/media/library-page.svelte';

	let { data } = $props();
</script>

<PageTitle title="Series" />

<LibraryPage title="Series" items={data.items} genres={data.genres} />
