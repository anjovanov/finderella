<script lang="ts">
	import LoadedImage from '$lib/components/media/loaded-image.svelte';
	import { cn } from '$lib/utils.js';

	/** A small 2:3 poster; the flat placeholder stays until the image is in (or when there is none). */
	let { src, class: className }: { src: string | null; class?: string } = $props();
</script>

<div class={cn('relative aspect-[2/3] shrink-0 overflow-hidden rounded-md bg-muted', className)}>
	{#if src}
		<LoadedImage {src} alt="" class="absolute inset-0 size-full object-cover" />
	{/if}
</div>
