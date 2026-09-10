<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import SiteHeader from '$lib/components/site-header.svelte';

	let { data, children } = $props();

	// The admin area brings its own sidebar chrome; login/register have no
	// user, so the navbar disappears there too. Error pages keep it.
	const inAdmin = $derived(page.route.id?.startsWith('/admin') ?? false);
	const showHeader = $derived(!!data.user && (page.error !== null || !inAdmin));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if showHeader && data.user}
	<SiteHeader user={data.user} />
{/if}
{#if inAdmin && !page.error}
	{@render children()}
{:else}
	<main class="min-h-svh">
		{@render children()}
	</main>
{/if}
