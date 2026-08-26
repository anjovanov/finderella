<script lang="ts">
	import { fly } from 'svelte/transition';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon } from '@hugeicons/core-free-icons';
	import type { Series } from '$lib/data';
	import Carousel from './carousel.svelte';
	import EpisodeCard from './episode-card.svelte';

	let {
		show,
		currentEpisodeId,
		onclose
	}: {
		show: Series;
		currentEpisodeId: string;
		onclose: () => void;
	} = $props();

	// Defaults to the season being watched; a pill click overrides it. The panel
	// is {#if}-mounted fresh on each open, so the override resets every time.
	let seasonOverride: number | undefined = $state();
	const selectedSeason = $derived(
		seasonOverride ??
			show.seasons.find((s) => s.episodes.some((e) => e.id === currentEpisodeId))?.number ??
			show.seasons[0].number
	);
	const season = $derived(show.seasons.find((s) => s.number === selectedSeason) ?? show.seasons[0]);
</script>

<div
	class="episodes-panel"
	role="dialog"
	aria-label="Episodes"
	transition:fly={{ y: 16, duration: 200 }}
>
	<div class="flex items-center justify-between gap-4">
		<span class="text-lg font-semibold text-white">Episodes</span>
		<button
			type="button"
			aria-label="Close episodes"
			class="flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
			onclick={onclose}
		>
			<HugeiconsIcon icon={Cancel01Icon} class="size-5" />
		</button>
	</div>

	{#if show.seasons.length > 1}
		<div class="flex flex-wrap items-center gap-2">
			{#each show.seasons as s (s.number)}
				<button
					type="button"
					class={[
						'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
						s.number === selectedSeason
							? 'bg-primary text-primary-foreground'
							: 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
					]}
					aria-pressed={s.number === selectedSeason}
					onclick={() => (seasonOverride = s.number)}
				>
					Season {s.number}
				</button>
			{/each}
		</div>
	{/if}

	<p class="text-sm text-white/60">{season.year} · {season.episodes.length} episodes</p>

	<!-- Same arrowTop math as the series detail page: scroller py-3 (0.75rem)
	     + half the 20rem 16:9 thumb (5.625rem) − half the arrow button (1.125rem). -->
	<Carousel
		label="Season {selectedSeason} episodes"
		arrowTop="top-[5.25rem]"
		gutter="px-6 scroll-px-6"
		class="-mx-4"
	>
		{#each season.episodes as episode (episode.id)}
			<EpisodeCard
				{episode}
				item={show}
				active={episode.id === currentEpisodeId}
				onNavigate={onclose}
			/>
		{/each}
	</Carousel>
</div>

<style>
	/* Bottom sheet above the two-row control bar; same surface treatment as the
	   captions menu in watch-player.svelte. */
	.episodes-panel {
		position: absolute;
		inset-inline: 1rem;
		bottom: 7.5rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: calc(100% - 12rem);
		overflow-y: auto;
		padding: 1rem;
		background: rgb(23 23 28 / 0.95);
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: var(--radius-xl);
		backdrop-filter: blur(8px);
	}
</style>
