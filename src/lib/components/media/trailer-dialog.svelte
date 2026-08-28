<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	let {
		open = $bindable(false),
		trailerKey,
		title
	}: { open?: boolean; trailerKey: string; title: string } = $props();

	// The iframe is mounted only while open, so closing the dialog stops playback.
	const src = $derived(
		`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerKey)}?autoplay=1&rel=0&modestbranding=1`
	);
</script>

<Dialog.Root bind:open>
	<!--
		The built-in close sits inside the frame, on top of YouTube's own top-right
		controls, so the dialog draws its own just above the player instead.
		The content stays `overflow-visible` so that button isn't clipped.
	-->
	<Dialog.Content
		showCloseButton={false}
		class="w-[min(96vw,64rem)] max-w-none gap-0 border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-none"
	>
		<Dialog.Title class="sr-only">{title} — trailer</Dialog.Title>
		<Dialog.Description class="sr-only">Trailer playing from YouTube.</Dialog.Description>
		<Dialog.Close>
			{#snippet child({ props })}
				<Button
					variant="secondary"
					size="icon"
					class="absolute -top-12 right-0 rounded-full"
					aria-label="Close trailer"
					{...props}
				>
					<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
				</Button>
			{/snippet}
		</Dialog.Close>
		<div class="overflow-hidden rounded-2xl bg-black ring-1 ring-border">
			{#if open}
				<iframe
					{src}
					title="{title} trailer"
					class="aspect-video w-full"
					allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
					allowfullscreen
					referrerpolicy="strict-origin-when-cross-origin"
				></iframe>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
