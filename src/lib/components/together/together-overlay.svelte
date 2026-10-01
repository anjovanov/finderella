<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { PlayIcon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import type { TogetherSession } from '$lib/together/session.svelte';

	/**
	 * What a watch party draws over the video: floating reactions, a status /
	 * notice pill and the "Join playback" prompt. Lives inside <media-container>
	 * so it shows in fullscreen; never blocks the controls except the prompt.
	 */
	let { party }: { party: TogetherSession } = $props();

	// Connection trouble outranks "waiting for…", which outranks a feed line.
	const pill = $derived(
		party.status === 'reconnecting'
			? 'Reconnecting to the watch party…'
			: party.status === 'connecting'
				? 'Joining the watch party…'
				: (party.waitingLabel ?? party.notice)
	);
</script>

<div class="pointer-events-none absolute inset-0 z-20 overflow-hidden">
	{#if pill}
		{#key pill}
			<div
				class="together-pill absolute top-24 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm sm:top-28"
				role="status"
			>
				{pill}
			</div>
		{/key}
	{/if}

	{#each party.reactions as reaction (reaction.id)}
		<div
			class="together-reaction absolute bottom-32 flex flex-col items-center"
			style:left="{reaction.x}%"
		>
			<span class="text-4xl leading-none opacity-80 drop-shadow-lg sm:text-5xl"
				>{reaction.emoji}</span
			>
			<span class="mt-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white/90 opacity-80">
				{reaction.name}
			</span>
		</div>
	{/each}
</div>

{#if party.needsGesture}
	<div
		class="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
	>
		<div class="flex max-w-sm flex-col items-center gap-4 text-center text-white">
			<p class="text-lg font-medium">The party is already watching</p>
			<p class="text-sm text-white/70">Your browser needs a click before it starts the video.</p>
			<Button size="lg" onclick={() => party.resumeWithGesture()}>
				<HugeiconsIcon icon={PlayIcon} data-icon="inline-start" />
				Join playback
			</Button>
		</div>
	</div>
{/if}

<style>
	/* Fade in with a short delay so sub-second waits never flash a pill. */
	.together-pill {
		animation: pill-in 0.25s ease-out 0.4s both;
	}

	.together-reaction {
		animation: float-up 3.2s ease-out forwards;
	}

	@keyframes pill-in {
		from {
			opacity: 0;
			translate: 0 -0.25rem;
		}
	}

	@keyframes float-up {
		0% {
			opacity: 0;
			transform: translateY(0) scale(0.6);
		}
		12% {
			opacity: 1;
			transform: translateY(-2rem) scale(1.1);
		}
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translateY(-16rem) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.together-pill {
			animation: none;
		}

		.together-reaction {
			animation: fade 3.2s linear forwards;
		}

		@keyframes fade {
			0%,
			85% {
				opacity: 1;
			}
			100% {
				opacity: 0;
			}
		}
	}
</style>
