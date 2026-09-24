<script lang="ts">
	import { BarChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import type { BucketPoint } from '$lib/data/stats';

	/** Stacked movies / episodes bars per bucket (weekday, hour of day). */
	let { data, unit }: { data: BucketPoint[]; unit?: string } = $props();

	const config = {
		movies: { label: 'Movies', color: 'var(--chart-1)' },
		episodes: { label: 'Episodes', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;
</script>

<Chart.Container {config} class="aspect-auto h-56 w-full">
	<BarChart
		{data}
		x="label"
		series={[
			{ key: 'movies', label: config.movies.label, color: config.movies.color },
			{ key: 'episodes', label: config.episodes.label, color: config.episodes.color }
		]}
		seriesLayout="stack"
		bandPadding={0.25}
		legend
		props={{ yAxis: { format: (v: number) => (unit ? `${v}${unit}` : String(v)) } }}
	>
		{#snippet tooltip()}
			<Chart.Tooltip indicator="dot" />
		{/snippet}
	</BarChart>
</Chart.Container>
