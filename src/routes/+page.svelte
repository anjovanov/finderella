<script lang="ts">
	import { resolve } from '$app/paths';
	import HeroBanner from '$lib/components/media/hero-banner.svelte';
	import MediaRow from '$lib/components/media/media-row.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Home · Finderella</title>
</svelte:head>

{#if data.hero}
	<HeroBanner item={data.hero} />
{/if}

<div class="flex flex-col gap-10 py-8">
	{#each data.rows as row (row.title)}
		<MediaRow title={row.title} items={row.items} href={row.href} variant="backdrop" />
	{/each}
	{#if !data.hero && data.rows.length === 0}
		<p class="page-gutter py-16 text-center text-muted-foreground">
			Your library is empty. Pair a device and add a media folder in
			<a href={resolve('/settings/devices')} class="text-primary hover:underline"
				>Settings → Devices</a
			>.
		</p>
	{/if}
</div>
