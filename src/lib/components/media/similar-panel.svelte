<script lang="ts">
	import type { Movie } from '$lib/data';
	import Carousel from './carousel.svelte';
	import PlayerSheet from './player-sheet.svelte';
	import PosterCard from './poster-card.svelte';

	let {
		items,
		itemHref,
		onclose
	}: {
		/** Ranked by `similarMovies`, best first. */
		items: Movie[];
		/** Card link (the movie's watch page: a click starts it in this player). */
		itemHref: (movie: Movie) => string;
		onclose: () => void;
	} = $props();
</script>

<PlayerSheet
	title="More Like This"
	closeLabel="Close more like this"
	class="similar-panel"
	{onclose}
>
	<!-- Cards pinned to the episode cards' 20rem width, so the arrowTop math is
	     the episodes panel's: py-3 (0.75rem) + half the 16:9 thumb (5.625rem)
	     − half the arrow button (1.125rem). -->
	<Carousel
		label="Movies like this one"
		arrowTop="top-[5.25rem]"
		gutter="px-6 scroll-px-6"
		class="-mx-4"
	>
		{#each items as movie (movie.id)}
			<PosterCard
				item={movie}
				variant="backdrop"
				class="w-80 sm:w-80"
				href={itemHref(movie)}
				onNavigate={onclose}
				showMenu={false}
			/>
		{/each}
	</Carousel>
</PlayerSheet>
