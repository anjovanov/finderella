<script lang="ts">
	import { branding } from '$lib/branding';
	import { pageTitle } from '$lib/data/branding';

	/** The page's own part of the title; the app name is appended ("Movies · Finderella"). */
	let { title }: { title?: string | null } = $props();
</script>

<svelte:head>
	<title>{pageTitle(title, branding().appName)}</title>
</svelte:head>
