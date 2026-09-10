<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import SiteHeader from '$lib/components/site-header.svelte';

	let { data, children } = $props();

	// The admin area brings its own sidebar chrome and the auth pages stand
	// alone; everywhere else the navbar shows (guests included, on a public
	// hub). Error pages keep it.
	const inAdmin = $derived(page.route.id?.startsWith('/admin') ?? false);
	const authPage = $derived(page.route.id === '/login' || page.route.id === '/register');
	const showHeader = $derived(!authPage && (page.error !== null || !inAdmin));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if showHeader}
	<SiteHeader user={data.user} />
{/if}
{#if inAdmin && !page.error}
	{@render children()}
{:else}
	<main class="min-h-svh">
		{@render children()}
	</main>
{/if}
