<script lang="ts">
	/**
	 * Watch-progress line under a card. Always occupies its 3px so titles line
	 * up across a row whether or not a card has progress; the track and fill
	 * only render when there is something to show.
	 */
	let { fraction }: { fraction?: number } = $props();
	const percent = $derived(fraction === undefined ? null : Math.round(fraction * 100));
</script>

<div class="h-[3px] w-full">
	{#if percent !== null}
		<div
			class="h-full w-full overflow-hidden rounded-full bg-white/15"
			role="progressbar"
			aria-label="Watched"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={percent}
		>
			<div class="h-full rounded-full bg-primary" style:width="{percent}%"></div>
		</div>
	{/if}
</div>
