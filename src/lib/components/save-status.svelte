<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
	import type { SettingsSaver } from '$lib/settings-saver.svelte';

	/** Where a card's auto-saving controls stand: Saving… / Saved / the error. */
	let { saver }: { saver: SettingsSaver } = $props();
</script>

<p class="flex min-h-5 max-w-60 items-center justify-end gap-1.5 text-right text-sm" role="status">
	{#if saver.status === 'saving'}
		<span class="text-muted-foreground">Saving…</span>
	{:else if saver.status === 'saved'}
		<HugeiconsIcon icon={CheckmarkCircle02Icon} class="size-4 text-primary" />
		<span class="text-muted-foreground">Saved</span>
	{:else if saver.status === 'error'}
		<span class="text-destructive">{saver.error}</span>
	{/if}
</p>
