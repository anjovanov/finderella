<script lang="ts">
	import { AreaChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';
	import type { DayPoint } from '$lib/data/stats';

	/** Stacked area over calendar days (YYYY-MM-DD in the admin's zone). */
	let {
		data,
		series,
		unit
	}: {
		data: DayPoint[];
		series: {
			key: 'movies' | 'episodes' | 'direct' | 'transcoded';
			label: string;
			color: string;
		}[];
		/** Tooltip suffix, e.g. "h" for watch time. */
		unit?: string;
	} = $props();

	const config = $derived(
		Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
	) satisfies Chart.ChartConfig;

	// Local midnight, so axis ticks and tooltips show the admin's calendar day.
	const points = $derived(data.map((d) => ({ ...d, date: new Date(`${d.day}T00:00:00`) })));
	const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	const tooltipFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<Chart.Container {config} class="aspect-auto h-64 w-full">
	<AreaChart
		data={points}
		x="date"
		series={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
		seriesLayout="stack"
		legend
		props={{
			area: { 'fill-opacity': 0.35, line: { class: 'stroke-2' } },
			xAxis: { format: (v: Date) => dayFormat.format(v), tickOcclusion: { padding: 8 } },
			yAxis: { format: (v: number) => (unit ? `${v}${unit}` : String(v)) }
		}}
	>
		{#snippet tooltip()}
			<Chart.Tooltip labelFormatter={(v: Date) => tooltipFormat.format(v)} indicator="dot" />
		{/snippet}
	</AreaChart>
</Chart.Container>
