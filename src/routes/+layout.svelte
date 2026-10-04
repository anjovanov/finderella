<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Screensaver from '$lib/components/screensaver.svelte';
	import { ScreensaverController, setScreensaver } from '$lib/screensaver.svelte';
	import SiteHeader from '$lib/components/site-header.svelte';
	import { brandStyleSheet } from '$lib/data/branding';

	let { data, children } = $props();

	// One controller per app instance, via context: the player and trailer
	// inhibit it, the settings page previews it.
	setScreensaver(new ScreensaverController());

	// The admin area brings its own sidebar chrome and the auth pages and the
	// profile picker stand alone; everywhere else the navbar shows (guests
	// included, on a public hub). Error pages keep it.
	const inAdmin = $derived(page.route.id?.startsWith('/admin') ?? false);
	const authPage = $derived(
		page.route.id === '/login' || page.route.id === '/register' || page.route.id === '/profiles'
	);
	const showHeader = $derived(!authPage && (page.error !== null || !inAdmin));

	// The server renders the class into <html> for the first paint; this keeps
	// it in sync when the viewer switches theme (the settings form re-runs this
	// layout's load) and on pages that skip SSR.
	const theme = $derived(data.preferences.theme);
	$effect(() => {
		document.documentElement.classList.toggle('dark', theme === 'dark');
	});

	// hooks.server.ts inlines the same stylesheet for the first paint; this copy
	// follows the data, so saving the admin Branding form restyles the app live.
	const brandCss = $derived(brandStyleSheet(data.branding));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- The page background of each theme (--background). -->
	<meta name="theme-color" content={theme === 'dark' ? '#101014' : '#f8fafb'} />
	{#if brandCss}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- built from the preset/font tables only, never admin text -->
		{@html `<style>${brandCss}</style>`}
	{/if}
</svelte:head>

{#if showHeader}
	<SiteHeader user={data.user} profile={data.profile} profiles={data.profiles} />
{/if}
{#if inAdmin && !page.error}
	{@render children()}
{:else}
	<main class="min-h-svh">
		{@render children()}
	</main>
{/if}

<Screensaver settings={data.preferences.screensaver} />
