<script lang="ts">
	import type { Series } from '$lib/data';
	import plural from '$lib/plural';
	import Carousel from './carousel.svelte';
	import EpisodeCard from './episode-card.svelte';
	import PlayerSheet from './player-sheet.svelte';

	let {
		show,
		currentEpisodeId,
		episodeHref,
		onclose
	}: {
		show: Series;
		currentEpisodeId: string;
		/** Link builder for the cards (defaults to the plain episode watch page). */
		episodeHref?: (episodeId: string) => string;
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

<PlayerSheet title="Episodes" closeLabel="Close episodes" class="episodes-panel" {onclose}>
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

	<p class="text-sm text-white/60">
		{season.year} · {plural(season.episodes.length, ['# episode', '# episodes'])}
	</p>

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
				season={season.number}
				item={show}
				imageUrl={episode.stillUrl ?? season.posterUrl}
				active={episode.id === currentEpisodeId}
				href={episodeHref?.(episode.id)}
				onNavigate={onclose}
			/>
		{/each}
	</Carousel>
</PlayerSheet>
