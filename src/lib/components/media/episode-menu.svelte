<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckmarkCircle02Icon, MoreVerticalIcon } from '@hugeicons/core-free-icons';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { episodeLabel, type Episode, type Series } from '$lib/data';
	import { markAsWatched } from '$lib/watchlist-client';

	let {
		show,
		episode,
		season
	}: {
		show: Series;
		episode: Episode;
		/** Season number the episode belongs to. */
		season: number;
	} = $props();

	const watched = $derived(episode.progress === 1);

	async function markWatched() {
		try {
			await markAsWatched({ kind: 'series', slug: show.id, episodeSlug: episode.id });
			// Re-runs the loader: the episode's bar fills and Play/Resume moves on.
			await invalidateAll();
		} catch {
			// Nothing changed; nothing to roll back.
		}
	}
</script>

{#if page.data.user}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<!-- Same trigger as CardMenu: classes on the rendered button, hidden until the
				     card is hovered/focused, always shown on touch screens. -->
				<button
					{...props}
					type="button"
					aria-label="More options for {episodeLabel(season, episode.number)} · {episode.title}"
					class="absolute top-2 left-2 z-10 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity outline-none group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
				>
					<HugeiconsIcon icon={MoreVerticalIcon} class="size-4" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="min-w-56">
			<DropdownMenu.Item disabled={watched} onSelect={markWatched}>
				<HugeiconsIcon icon={CheckmarkCircle02Icon} />
				{watched ? 'Watched' : 'Mark as watched'}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
