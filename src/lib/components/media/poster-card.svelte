<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { StarIcon } from '@hugeicons/core-free-icons';
	import { cn } from '$lib/utils.js';
	import { mediaHref, type MediaItem } from '$lib/data';
	import CardMenu from './card-menu.svelte';
	import PosterArt from './poster-art.svelte';
	import ProgressLine from './progress-line.svelte';

	let {
		item,
		variant = 'poster',
		class: className,
		menu
	}: {
		item: MediaItem;
		variant?: 'poster' | 'backdrop';
		class?: string;
		/** Extra entries for the ⋮ menu (signed-in viewers only). */
		menu?: { continueWatching?: boolean };
	} = $props();
</script>

<!-- The ⋮ menu button can't live inside the link (interactive content inside
     <a> is invalid), so the card is a wrapper holding the link + the menu. -->
<div
	class={cn(
		'group relative flex shrink-0 snap-start flex-col',
		variant === 'poster' ? 'w-36 sm:w-44' : 'w-80 sm:w-96',
		className
	)}
>
	<!-- mediaHref() returns resolve()d paths -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a href={mediaHref(item)} class="flex flex-col gap-2 outline-none">
		<div
			class="relative overflow-hidden rounded-xl ring-1 ring-border transition-all duration-200 group-focus-within:ring-2 group-focus-within:ring-primary group-hover:scale-[1.015] group-hover:ring-2 group-hover:ring-primary"
		>
			<PosterArt {item} {variant} showTitle />
			<span
				class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm"
			>
				<HugeiconsIcon icon={StarIcon} class="size-3 text-yellow-400" />
				{item.rating.toFixed(1)}
			</span>
		</div>
		<ProgressLine fraction={item.progress} />
		<div class="flex flex-col">
			<span class="truncate text-sm font-medium group-hover:text-primary">{item.title}</span>
			<span class="text-xs text-muted-foreground">
				{item.year}{item.kind === 'series'
					? ` · ${item.seasons.length} season${item.seasons.length === 1 ? '' : 's'}`
					: ''}
			</span>
		</div>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	<CardMenu {item} continueWatching={menu?.continueWatching} />
</div>
