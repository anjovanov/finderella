<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { MediaItem } from '$lib/data';
	import LoadedImage from './loaded-image.svelte';

	let {
		item,
		variant = 'poster',
		showTitle = false,
		imageUrl,
		class: className
	}: {
		item: MediaItem;
		variant?: 'poster' | 'backdrop';
		/** Overlay the title bottom-left once the image is showing. */
		showTitle?: boolean;
		/** Overrides the item's own artwork (e.g. an episode still); falls back to it when unset. */
		imageUrl?: string;
		class?: string;
	} = $props();

	const src = $derived(
		imageUrl ?? (variant === 'backdrop' ? item.backdropUrl : item.posterUrl) ?? null
	);
	let loaded = $state(false);
	// Until the image is fully in (or when there is none), the box is a flat
	// gray placeholder with the title centered.
	const ready = $derived(src !== null && loaded);
</script>

<div
	class={cn(
		'relative flex overflow-hidden bg-muted',
		variant === 'poster' ? 'aspect-[2/3] p-3' : 'aspect-video p-4',
		ready ? 'items-end' : 'items-center justify-center',
		className
	)}
>
	{#if src}
		<LoadedImage {src} bind:loaded class="absolute inset-0 size-full object-cover" />
	{/if}
	{#if ready}
		<div
			class="absolute inset-0"
			style:background="linear-gradient(to top, rgb(0 0 0 / 0.55), transparent 45%)"
		></div>
		{#if showTitle}
			<div class="relative flex w-full flex-col gap-0.5 text-white">
				<span
					class={cn(
						'font-semibold tracking-[0.18em] uppercase [text-shadow:0_1px_8px_rgb(0_0_0/0.5)]',
						variant === 'poster' ? 'text-sm leading-tight' : 'text-base'
					)}
				>
					{item.title}
				</span>
				<span class="text-[0.65rem] tracking-[0.3em] text-white/60 uppercase">{item.year}</span>
			</div>
		{/if}
	{:else}
		<div class="relative flex flex-col items-center gap-1 text-center text-muted-foreground">
			<span
				class={cn(
					'font-semibold tracking-[0.18em] text-balance uppercase',
					variant === 'poster' ? 'text-sm leading-tight' : 'text-base'
				)}
			>
				{item.title}
			</span>
			<span class="text-[0.65rem] tracking-[0.3em] uppercase opacity-70">{item.year}</span>
		</div>
	{/if}
</div>
