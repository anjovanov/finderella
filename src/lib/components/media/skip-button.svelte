<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';

	/**
	 * "Skip intro" / "Skip credits" / "Next episode" over the player (bottom
	 * right, above the control bar). Presentational: the player decides when
	 * it shows and what it does. With `progress` the button fills up as the
	 * autoplay countdown runs.
	 */
	let {
		label,
		onclick,
		progress = null,
		secondary,
		note,
		back = false
	}: {
		label: string;
		onclick: () => void;
		/** 0..1 — how far the countdown has run; null = no countdown. */
		progress?: number | null;
		/** A quieter second action, e.g. "Watch credits". */
		secondary?: { label: string; onclick: () => void };
		/** Plain text before the buttons, e.g. "Intro skipped". */
		note?: string;
		/** The action goes back (undo) rather than forward. */
		back?: boolean;
	} = $props();

	const duration = $derived(prefersReducedMotion.current ? 0 : 150);

	// A mouse click leaves focus on the button, and the player's Space shortcut
	// skips focused buttons — which would re-activate this one instead of pausing.
	function run(action: () => void, event: MouseEvent) {
		(event.currentTarget as HTMLElement).blur();
		action();
	}
</script>

<div
	class="pointer-events-auto absolute right-4 bottom-28 z-20 flex items-center gap-2 sm:right-6"
	transition:fade={{ duration }}
>
	{#if note}
		<span
			class="rounded-lg bg-black/50 px-3 py-2.5 text-sm text-white/85 backdrop-blur-sm"
			role="status">{note}</span
		>
	{/if}
	{#if secondary}
		<button
			type="button"
			class="rounded-lg bg-black/50 px-4 py-2.5 text-sm font-medium text-white/85 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
			onclick={(event) => run(secondary.onclick, event)}
		>
			{secondary.label}
		</button>
	{/if}
	<button
		type="button"
		class="relative flex items-center gap-2 overflow-hidden rounded-lg border border-white/40 bg-black/60 px-5 py-2.5 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:border-white hover:bg-white hover:text-black"
		onclick={(event) => run(onclick, event)}
		aria-keyshortcuts={back ? undefined : 'S'}
	>
		{#if progress !== null}
			<!-- Countdown fill; linear over one timeupdate (~250 ms) so it glides. -->
			<span
				class="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-300 ease-linear motion-reduce:transition-none"
				style:width="{Math.min(1, Math.max(0, progress)) * 100}%"
				aria-hidden="true"
			></span>
		{/if}
		{#if back}
			<HugeiconsIcon icon={ArrowLeft01Icon} class="relative size-5" />
		{/if}
		<span class="relative">{label}</span>
		{#if !back}
			<HugeiconsIcon icon={ArrowRight01Icon} class="relative size-5" />
		{/if}
	</button>
</div>
