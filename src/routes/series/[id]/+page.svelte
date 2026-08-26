<script lang="ts">
	import { Separator } from '$lib/components/ui/separator';
	import * as Tabs from '$lib/components/ui/tabs';
	import Carousel from '$lib/components/media/carousel.svelte';
	import DetailHero from '$lib/components/media/detail-hero.svelte';
	import EpisodeCard from '$lib/components/media/episode-card.svelte';
	import MediaRow from '$lib/components/media/media-row.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.show.title} · Finderella</title>
</svelte:head>

<DetailHero item={data.show} />

<div class="flex flex-col gap-8 py-8">
	<section class="flex flex-col">
		<Tabs.Root value="1">
			<div class="flex page-gutter flex-col gap-4">
				<h2 class="text-lg font-semibold tracking-tight">Episodes</h2>
				<Tabs.List>
					{#each data.show.seasons as season (season.number)}
						<Tabs.Trigger value={String(season.number)}>Season {season.number}</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</div>
			{#each data.show.seasons as season (season.number)}
				<Tabs.Content value={String(season.number)}>
					<div class="flex flex-col gap-1 pt-3">
						<p class="page-gutter text-sm text-muted-foreground">
							{season.year} · {season.episodes.length} episodes
						</p>
						<!-- arrowTop: strip padding (0.75rem) + half the 20rem-wide 16:9 thumb (5.625rem)
						     - half the button (1.125rem) = 5.25rem -->
						<Carousel label="Season {season.number} episodes" arrowTop="top-[5.25rem]">
							{#each season.episodes as episode (episode.id)}
								<EpisodeCard {episode} item={data.show} />
							{/each}
						</Carousel>
					</div>
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	</section>
	<section class="flex page-gutter flex-col gap-3">
		<h2 class="text-lg font-semibold tracking-tight">Cast</h2>
		<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
			{#each data.show.cast as name (name)}
				<span>{name}</span>
			{/each}
		</div>
	</section>
	{#if data.related.length > 0}
		<div class="page-gutter">
			<Separator />
		</div>
		<MediaRow title="More like this" items={data.related} />
	{/if}
</div>
