<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card';

	/** A ranked card ("Most watched movies"…): one row per item. */
	let {
		title,
		items,
		row,
		empty = 'Nothing played in this period.'
	}: {
		title: string;
		items: T[];
		row: Snippet<[T]>;
		empty?: string;
	} = $props();
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>{title}</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if items.length === 0}
			<p class="text-sm text-muted-foreground">{empty}</p>
		{:else}
			<ol class="flex flex-col gap-3">
				{#each items as item, index (index)}
					<li class="flex min-w-0 items-center gap-3">
						<span class="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
							{index + 1}
						</span>
						{@render row(item)}
					</li>
				{/each}
			</ol>
		{/if}
	</Card.Content>
</Card.Root>
