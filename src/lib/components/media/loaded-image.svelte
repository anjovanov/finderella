<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { cn } from '$lib/utils.js';

	/**
	 * An <img> that stays invisible until the whole file has arrived, then
	 * fades in briefly. Progressive JPEGs (TMDB) would otherwise paint their
	 * blurry first pass over the placeholder. Renders no wrapper element, so
	 * the <img> stays a direct child of the caller's box.
	 */
	let {
		src,
		alt = '',
		class: className,
		loaded = $bindable(false)
	}: {
		src: string;
		alt?: string;
		class?: string;
		/** true once the current `src` is fully decoded and visible. */
		loaded?: boolean;
	} = $props();

	// Runs on mount and again whenever `src` changes (it is read inside): a
	// cached image can finish before hydration (no `load` event for us), and a
	// reused component gets a new source on client-side navigation.
	const syncLoaded: Attachment<HTMLImageElement> = (img) => {
		void src;
		loaded = img.complete && img.naturalWidth > 0;
	};
</script>

<img
	{@attach syncLoaded}
	{src}
	{alt}
	loading="lazy"
	decoding="async"
	onload={() => (loaded = true)}
	onerror={() => (loaded = false)}
	class={cn(
		'transition-opacity duration-100 motion-reduce:transition-none',
		loaded ? 'opacity-100' : 'opacity-0',
		className
	)}
/>
