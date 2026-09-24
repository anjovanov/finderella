<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { PlayerState } from '$lib/data/stats';

	/** A live stream's player state; "Playing" breathes so it reads as live at a glance. */
	let {
		state,
		terminating = false,
		class: className
	}: { state: PlayerState; terminating?: boolean; class?: string } = $props();

	const LABELS = {
		playing: 'Playing',
		paused: 'Paused',
		buffering: 'Buffering',
		unknown: 'Starting'
	} as const;

	const live = $derived(state === 'playing' && !terminating);
</script>

<span class={['inline-flex shrink-0 rounded-4xl', live && 'live', className]}>
	<Badge variant={live ? 'default' : 'secondary'} class={live ? 'pl-1.5' : undefined}>
		{#if live}
			<span class="dot size-1.5 rounded-full bg-primary-foreground" aria-hidden="true"></span>
		{/if}
		{terminating ? 'Stopping' : LABELS[state]}
	</Badge>
</span>

<style>
	@media (prefers-reduced-motion: no-preference) {
		.live {
			animation: breathe 2.4s ease-in-out infinite;
		}
		.dot {
			animation: dot 2.4s ease-in-out infinite;
		}
	}

	/* A soft ring that swells and fades around the pill, like a slow breath. */
	@keyframes breathe {
		0%,
		100% {
			box-shadow: 0 0 0 0 color-mix(in oklch, var(--primary) 55%, transparent);
		}
		50% {
			box-shadow: 0 0 0 5px color-mix(in oklch, var(--primary) 0%, transparent);
		}
	}

	@keyframes dot {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.45;
			transform: scale(0.7);
		}
	}
</style>
