<script lang="ts">
	import { TOGETHER_REACTIONS, type TogetherReaction } from '$lib/data/together';

	/** Control-bar flyout above the reactions button: one tap sends a reaction everyone sees float up. */
	let { onreact }: { onreact: (emoji: TogetherReaction) => void } = $props();
</script>

<!-- Centred over the reactions button (its parent); level with the player's other
     menus, which sit above the seek bar. -->
<div
	class="together-reactions captions-menu absolute bottom-full left-1/2 z-10 mb-15 w-max -translate-x-1/2"
	role="menu"
	aria-label="Send a reaction"
>
	<div class="grid grid-cols-4 gap-1">
		{#each TOGETHER_REACTIONS as emoji (emoji)}
			<button
				type="button"
				role="menuitem"
				class="flex size-11 items-center justify-center rounded-lg text-2xl transition-transform hover:scale-110 hover:bg-white/10"
				aria-label="React {emoji}"
				onclick={() => onreact(emoji)}
			>
				{emoji}
			</button>
		{/each}
	</div>
</div>
