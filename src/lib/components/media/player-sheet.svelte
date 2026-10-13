<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Cancel01Icon } from '@hugeicons/core-free-icons';

	let {
		title,
		closeLabel,
		onclose,
		class: className,
		children
	}: {
		title: string;
		/** aria-label of the ✕ button. */
		closeLabel: string;
		onclose: () => void;
		/** The player's click-outside handler finds the open sheet by this class. */
		class: string;
		children: Snippet;
	} = $props();
</script>

<div
	class={['player-sheet', className]}
	role="dialog"
	aria-label={title}
	transition:fly={{ y: 16, duration: 200 }}
>
	<div class="flex items-center justify-between gap-4">
		<span class="text-lg font-semibold text-white">{title}</span>
		<button
			type="button"
			aria-label={closeLabel}
			class="flex size-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
			onclick={onclose}
		>
			<HugeiconsIcon icon={Cancel01Icon} class="size-5" />
		</button>
	</div>

	{@render children()}
</div>

<style>
	/* Bottom sheet above the two-row control bar (More Episodes / More Like This);
	   same surface treatment as the captions menu in watch-player.svelte. */
	.player-sheet {
		position: absolute;
		inset-inline: 1rem;
		bottom: 7.5rem;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: calc(100% - 12rem);
		overflow-y: auto;
		padding: 1rem;
		background: rgb(23 23 28 / 0.95);
		border: 1px solid rgb(255 255 255 / 0.1);
		border-radius: var(--radius-xl);
		backdrop-filter: blur(8px);
	}
</style>
