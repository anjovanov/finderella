<script lang="ts">
	import type { Snippet } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';

	let {
		label,
		arrowTop,
		gutter = 'page-gutter',
		hoverShade = false,
		class: className,
		children
	}: {
		/** Accessible name for the scroll buttons, e.g. the row title. */
		label: string;
		/** Utility class vertically centering the arrows on the tiles' artwork (see callers). */
		arrowTop: string;
		/** Horizontal padding + matching scroll-padding for the scroller. Defaults to the
		 *  page gutter; pass e.g. `px-6 scroll-px-6` when embedded in a smaller surface. */
		gutter?: string;
		/** Deepen the edge fades while the row is hovered (alongside the arrows). */
		hoverShade?: boolean;
		class?: string;
		children: Snippet;
	} = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let canLeft = $state(false);
	let canRight = $state(false);

	function updateEdges() {
		if (!scroller) return;
		canLeft = scroller.scrollLeft > 4;
		canRight = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4;
	}

	function watchEdges(node: HTMLDivElement) {
		updateEdges();
		const resize = new ResizeObserver(updateEdges);
		resize.observe(node);
		// A row inside a hidden tab panel mounts with zero widths; re-measure
		// once it's actually shown.
		const visibility = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) updateEdges();
		});
		visibility.observe(node);
		return () => {
			resize.disconnect();
			visibility.disconnect();
		};
	}

	function scroll(direction: -1 | 1) {
		scroller?.scrollBy({ left: direction * scroller.clientWidth * 0.8, behavior: 'smooth' });
	}

	// Arrows are positioned via top only (no -translate-y-1/2): the Button's active:translate-y-px
	// press animation overwrites translate, so translate-based centering makes clicks jumpy and
	// can move the button out from under the cursor mid-click.
	const arrowBase =
		'absolute z-10 hidden rounded-full bg-white/90 text-neutral-900 shadow-lg ring-1 ring-black/20 backdrop-blur transition-opacity hover:bg-white hover:text-black sm:inline-flex ' +
		'pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100';
</script>

<div class={cn('group/row relative', className)}>
	<div
		bind:this={scroller}
		{@attach watchEdges}
		onscroll={updateEdges}
		class={cn(
			'scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth py-3',
			gutter
		)}
	>
		{@render children()}
	</div>
	<div
		class={cn(
			'pointer-events-none absolute inset-y-0 left-0 z-[5] w-10 bg-linear-to-r from-background/60 to-transparent transition-opacity duration-300 sm:w-14',
			hoverShade && 'group-hover/row:from-background/90 group-hover/row:sm:w-20',
			canLeft ? 'opacity-100' : 'opacity-0'
		)}
	></div>
	<div
		class={cn(
			'pointer-events-none absolute inset-y-0 right-0 z-[5] w-10 bg-linear-to-l from-background/60 to-transparent transition-opacity duration-300 sm:w-14',
			hoverShade && 'group-hover/row:from-background/90 group-hover/row:sm:w-20',
			canRight ? 'opacity-100' : 'opacity-0'
		)}
	></div>
	{#if canLeft}
		<Button
			variant="secondary"
			size="icon"
			aria-label="Scroll {label} left"
			onclick={() => scroll(-1)}
			class={cn(arrowBase, arrowTop, 'left-3')}
		>
			<HugeiconsIcon icon={ArrowLeft01Icon} />
		</Button>
	{/if}
	{#if canRight}
		<Button
			variant="secondary"
			size="icon"
			aria-label="Scroll {label} right"
			onclick={() => scroll(1)}
			class={cn(arrowBase, arrowTop, 'right-3')}
		>
			<HugeiconsIcon icon={ArrowRight01Icon} />
		</Button>
	{/if}
</div>
