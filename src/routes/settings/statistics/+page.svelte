<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { onMount } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ChartHistogramIcon } from '@hugeicons/core-free-icons';
	import { mediaHref } from '$lib/data';
	import BucketChart from '$lib/components/stats/bucket-chart.svelte';
	import DayChart from '$lib/components/stats/day-chart.svelte';
	import PeriodToggle from '$lib/components/stats/period-toggle.svelte';
	import PosterThumb from '$lib/components/stats/poster-thumb.svelte';
	import StatTile from '$lib/components/stats/stat-tile.svelte';
	import TopList from '$lib/components/stats/top-list.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { formatWatchTime } from '$lib/data/time';
	import type { TopTitle } from '$lib/data/stats';
	import { syncTimeZoneCookie } from '$lib/time-zone';

	let { data } = $props();

	// Days and hours are bucketed on this browser's calendar.
	onMount(() => syncTimeZoneCookie(data.tz, '/settings/statistics'));

	const plural = (n: number, one: string, many: string) =>
		`${n.toLocaleString()} ${n === 1 ? one : many}`;

	// The last window is "All time": nothing there means nothing to chart either.
	const hasHistory = $derived((data.windows.at(-1)?.plays ?? 0) > 0);

	// Both metrics come with the load; switching is instant.
	let metric = $state<'plays' | 'duration'>('plays');
	const series = $derived(data.graphs[metric]);
	const unit = $derived(metric === 'duration' ? 'h' : undefined);
	const noun = $derived(metric === 'plays' ? 'Plays' : 'Watch time (hours)');
</script>

<PageTitle title="Statistics · Settings" />

{#snippet titleRow(item: TopTitle)}
	<PosterThumb src={item.posterUrl} class="w-9" />
	<div class="flex min-w-0 flex-1 flex-col">
		{#if item.slug}
			<!-- mediaHref() returns resolve()d paths -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={mediaHref({ kind: item.kind, id: item.slug })}
				class="truncate font-medium hover:underline"
			>
				{item.title}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{:else}
			<span class="truncate font-medium">{item.title}</span>
		{/if}
		<span class="text-xs text-muted-foreground">
			{plural(item.plays, 'play', 'plays')} · {formatWatchTime(item.playedSeconds)}
		</span>
	</div>
{/snippet}

{#if !hasHistory}
	<Empty.Root class="border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon">
				<HugeiconsIcon icon={ChartHistogramIcon} />
			</Empty.Media>
			<Empty.Title>Nothing watched yet</Empty.Title>
			<Empty.Description>
				Your watch time, most watched titles and viewing habits show up here once you've watched
				something on this profile.
			</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{:else}
	<section class="flex flex-col gap-4">
		<div>
			<h2 class="text-lg font-semibold">Watch time</h2>
			<p class="text-sm text-muted-foreground">
				Finished {plural(data.finished.movies, 'movie', 'movies')} and {plural(
					data.finished.episodes,
					'episode',
					'episodes'
				)}.
			</p>
		</div>
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{#each data.windows as window (window.label)}
				<StatTile
					label={window.label}
					value={formatWatchTime(window.playedSeconds)}
					hint={plural(window.plays, 'play', 'plays')}
				/>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Activity</h2>
			<PeriodToggle days={data.days} />
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<TopList title="Most watched movies" items={data.movies} row={titleRow} />
			<TopList title="Most watched shows" items={data.shows} row={titleRow} />
		</div>

		<!-- The metric only switches the charts; the top lists show both. -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h3 class="font-semibold">Viewing charts</h3>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				value={metric}
				onValueChange={(v) => {
					if (v === 'plays' || v === 'duration') metric = v;
				}}
				aria-label="Chart metric"
			>
				<ToggleGroup.Item value="plays">Plays</ToggleGroup.Item>
				<ToggleGroup.Item value="duration">Watch time</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>{noun} per day</Card.Title>
				<Card.Description>Movies and episodes, stacked.</Card.Description>
			</Card.Header>
			<Card.Content>
				<DayChart
					data={series.byDay}
					{unit}
					series={[
						{ key: 'movies', label: 'Movies', color: 'var(--chart-1)' },
						{ key: 'episodes', label: 'Episodes', color: 'var(--chart-2)' }
					]}
				/>
			</Card.Content>
		</Card.Root>

		<!-- Full width: 24 hour labels don't fit half of the settings column. -->
		<Card.Root>
			<Card.Header>
				<Card.Title>By day of week</Card.Title>
			</Card.Header>
			<Card.Content>
				<BucketChart data={series.byWeekday} {unit} />
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Title>By hour of day</Card.Title>
			</Card.Header>
			<Card.Content>
				<BucketChart data={series.byHour} {unit} />
			</Card.Content>
		</Card.Root>
	</section>
{/if}
