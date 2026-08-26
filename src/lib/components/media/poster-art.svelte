<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { MediaItem } from '$lib/data';

	let {
		item,
		variant = 'poster',
		showTitle = false,
		hueShift = 0,
		class: className
	}: {
		item: MediaItem;
		variant?: 'poster' | 'backdrop';
		showTitle?: boolean;
		hueShift?: number;
		class?: string;
	} = $props();

	const hue = $derived((item.theme.hue + hueShift) % 360);
	const hue2 = $derived((item.theme.hue2 + hueShift) % 360);
	const background = $derived(
		[
			`radial-gradient(ellipse 90% 60% at 25% 12%, oklch(0.52 0.13 ${hue} / 0.6), transparent 60%)`,
			`radial-gradient(ellipse 80% 55% at 85% 90%, oklch(0.4 0.12 ${hue2} / 0.5), transparent 65%)`,
			`linear-gradient(160deg, oklch(0.34 0.08 ${hue}) 0%, oklch(0.2 0.05 ${hue2}) 55%, oklch(0.13 0.03 ${hue2}) 100%)`
		].join(', ')
	);
</script>

<div
	class={cn(
		'relative flex overflow-hidden',
		variant === 'poster' ? 'aspect-[2/3] items-end p-3' : 'aspect-video items-end p-4',
		className
	)}
	style:background
>
	{#if item.backdropUrl && variant === 'backdrop'}
		<img src={item.backdropUrl} alt="" class="absolute inset-0 size-full object-cover" />
	{:else if item.posterUrl && variant === 'poster'}
		<img src={item.posterUrl} alt="" class="absolute inset-0 size-full object-cover" />
	{/if}
	<div
		class="absolute inset-0"
		style:background="linear-gradient(to top, oklch(0.1 0.02 {hue2} / 0.55), transparent 45%)"
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
</div>
