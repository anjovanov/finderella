<script lang="ts">
	import type { MediaItem } from '$lib/data';
	import Carousel from './carousel.svelte';
	import PosterCard from './poster-card.svelte';

	let {
		title,
		items,
		href,
		variant = 'poster',
		size = 'md'
	}: {
		title: string;
		items: MediaItem[];
		href?: string;
		variant?: 'poster' | 'backdrop';
		/** `lg` = roomier poster tiles (detail pages' "More like this"). */
		size?: 'md' | 'lg';
	} = $props();

	// Center arrows on the artwork, not the whole tile (which includes the caption below).
	// top = strip padding (0.75rem) + half the artwork height - half the button (size-9 -> 1.125rem).
	// Artwork at sm+ tile widths: backdrop 24rem wide 16:9 -> 13.5rem tall; poster 11rem wide 2:3 -> 16.5rem;
	// lg poster 15rem wide -> 22.5rem.
	const arrowTop = $derived(
		variant === 'backdrop' ? 'top-[6.375rem]' : size === 'lg' ? 'top-[10.875rem]' : 'top-[7.875rem]'
	);
	const cardClass = $derived(variant === 'poster' && size === 'lg' ? 'w-52 sm:w-60' : undefined);
</script>

<section class="flex flex-col gap-3">
	<div class="page-gutter">
		<h2 class="text-lg font-semibold tracking-tight">
			{#if href}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolve()d paths -->
				<a {href} class="hover:text-primary">{title}</a>
			{:else}
				{title}
			{/if}
		</h2>
	</div>
	<Carousel label={title} {arrowTop} class="-mt-3">
		{#each items as item (item.id)}
			<PosterCard {item} {variant} class={cardClass} />
		{/each}
	</Carousel>
</section>
