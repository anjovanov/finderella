<script lang="ts">
	import { fade } from 'svelte/transition';

	/**
	 * Why a watch party ended for this viewer ("Ana ended the watch party."),
	 * over the player while it keeps playing. Fixed to the viewport, so it also
	 * shows in fullscreen (the player fullscreens the whole document).
	 */
	let { message }: { message: string | null } = $props();
</script>

{#if message}
	<div
		class="dark pointer-events-none fixed top-24 left-1/2 z-60 max-w-[90%] -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm"
		role="status"
		transition:fade={{ duration: 150 }}
	>
		{message}
	</div>
{/if}
