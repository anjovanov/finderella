<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import BucketChart from '$lib/components/stats/bucket-chart.svelte';
	import DayChart from '$lib/components/stats/day-chart.svelte';
	import PeriodToggle from '$lib/components/stats/period-toggle.svelte';
	import RankChart from '$lib/components/stats/rank-chart.svelte';
	import type { TopEntry } from '$lib/data/stats';

	let { data } = $props();

	// Both metrics come with the load; switching is instant.
	let metric = $state<'plays' | 'duration'>('plays');
	const series = $derived(data.graphs[metric]);
	const unit = $derived(metric === 'duration' ? 'h' : undefined);
	const noun = $derived(metric === 'plays' ? 'Plays' : 'Watch time (hours)');

	const formatValue = (value: number) =>
		metric === 'plays' ? value.toLocaleString() : `${value.toLocaleString()}h`;

	const rank = (entries: TopEntry[]) =>
		entries.map((e) => ({
			label: e.label,
			value: metric === 'plays' ? e.plays : Math.round(e.playedSeconds / 360) / 10
		}));
</script>

<svelte:head>
	<title>Graphs · Finderella</title>
</svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
	<ToggleGroup.Root
		type="single"
		variant="outline"
		size="sm"
		value={metric}
		onValueChange={(v) => {
			if (v === 'plays' || v === 'duration') metric = v;
		}}
		aria-label="Metric"
	>
		<ToggleGroup.Item value="plays">Plays</ToggleGroup.Item>
		<ToggleGroup.Item value="duration">Watch time</ToggleGroup.Item>
	</ToggleGroup.Root>
	<PeriodToggle days={data.days} />
</div>

<div class="grid gap-4 lg:grid-cols-2">
	<Card.Root class="lg:col-span-2">
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

	<Card.Root class="lg:col-span-2">
		<Card.Header>
			<Card.Title>Direct play vs transcode</Card.Title>
			<Card.Description>{noun} per day by how the stream reached the viewer.</Card.Description>
		</Card.Header>
		<Card.Content>
			<DayChart
				data={series.byDay}
				{unit}
				series={[
					{ key: 'direct', label: 'Direct play', color: 'var(--chart-1)' },
					{ key: 'transcoded', label: 'Transcode', color: 'var(--chart-3)' }
				]}
			/>
		</Card.Content>
	</Card.Root>

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

	<Card.Root>
		<Card.Header>
			<Card.Title>Top platforms</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if data.graphs.platforms.length}
				<RankChart data={rank(data.graphs.platforms)} label={noun} format={formatValue} />
			{:else}
				<p class="text-sm text-muted-foreground">Nothing played in this period.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Top users</Card.Title>
		</Card.Header>
		<Card.Content>
			{#if data.graphs.users.length}
				<RankChart
					data={rank(data.graphs.users)}
					label={noun}
					color="var(--chart-2)"
					format={formatValue}
				/>
			{:else}
				<p class="text-sm text-muted-foreground">Nothing played in this period.</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
