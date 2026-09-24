<script lang="ts">
	import { mediaHref } from '$lib/data';
	import { episodeCode, type PlayTitle } from '$lib/data/stats';

	/**
	 * A played title: movie "Title (year)", episode "Series · S1E2" over the
	 * episode name. Links to the catalog page while the title still exists.
	 */
	let { title }: { title: PlayTitle } = $props();

	const href = $derived(
		title.slug
			? mediaHref({ kind: title.kind === 'movie' ? 'movie' : 'series', id: title.slug })
			: null
	);
	const primary = $derived(
		title.kind === 'movie' ? title.title : `${title.seriesTitle ?? 'Unknown series'}`
	);
	const secondary = $derived(
		title.kind === 'movie'
			? title.year
				? String(title.year)
				: null
			: `${episodeCode(title)} · ${title.title}`
	);
</script>

<span class="flex min-w-0 flex-col">
	{#if href}
		<!-- mediaHref() returns resolve()d paths -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a {href} class="truncate font-medium hover:underline">{primary}</a>
	{:else}
		<span class="truncate font-medium">{primary}</span>
	{/if}
	{#if secondary}
		<span class="truncate text-xs text-muted-foreground">{secondary}</span>
	{/if}
</span>
