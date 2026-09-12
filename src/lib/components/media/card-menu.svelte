<script lang="ts">
	import { invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		BookmarkAdd01Icon,
		BookmarkRemove01Icon,
		Cancel01Icon,
		MoreVerticalIcon
	} from '@hugeicons/core-free-icons';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { MediaItem } from '$lib/data';
	import { dismissContinueWatching, setWatchlist } from '$lib/watchlist-client';

	let {
		item,
		continueWatching = false
	}: {
		item: MediaItem;
		/** Offer "Remove from Continue watching" (the home row only). */
		continueWatching?: boolean;
	} = $props();

	// Optimistic override until the next load stamps `item.inWatchlist` again.
	let override = $state<boolean | null>(null);
	const inWatchlist = $derived(override ?? item.inWatchlist ?? false);
	const watchlistLabel = $derived(
		item.kind === 'series'
			? inWatchlist
				? 'Remove Show from Watchlist'
				: 'Add Show to Watchlist'
			: inWatchlist
				? 'Remove from Watchlist'
				: 'Add to Watchlist'
	);

	async function toggleWatchlist() {
		const next = !inWatchlist;
		override = next;
		try {
			await setWatchlist(item.kind, item.id, next);
			// Only the /watchlist loader depends on this; elsewhere it's a no-op.
			await invalidate('app:watchlist');
		} catch {
			override = null;
		}
	}

	async function dismiss() {
		try {
			await dismissContinueWatching(item.kind, item.id);
			await invalidateAll();
		} catch {
			// The row stays; nothing to roll back.
		}
	}
</script>

{#if page.data.user}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<!-- Utility classes go on the rendered button, not on Trigger. Hidden until
				     the card is hovered/focused; always shown on touch screens. -->
				<button
					{...props}
					type="button"
					aria-label="More options for {item.title}"
					class="absolute top-2 left-2 z-10 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity outline-none group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
				>
					<HugeiconsIcon icon={MoreVerticalIcon} class="size-4" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="min-w-68">
			<DropdownMenu.Item onSelect={toggleWatchlist}>
				<!-- HugeiconsIcon draws its icon once on mount, hence the {#if}. -->
				{#if inWatchlist}
					<HugeiconsIcon icon={BookmarkRemove01Icon} />
				{:else}
					<HugeiconsIcon icon={BookmarkAdd01Icon} />
				{/if}
				{watchlistLabel}
			</DropdownMenu.Item>
			{#if continueWatching}
				<DropdownMenu.Separator />
				<DropdownMenu.Item onSelect={dismiss}>
					<HugeiconsIcon icon={Cancel01Icon} />
					Remove from Continue watching
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
