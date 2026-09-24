<script lang="ts">
	import { BarChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';

	/**
	 * Horizontal bars, largest first (top platforms, users, codecs…). Each
	 * label sits above its bar, left-aligned at the chart's edge, and the value
	 * follows the bar — so every chart lines up on the card's content edge no
	 * matter how long its labels are, and short bars keep readable labels.
	 */
	let {
		data,
		label = 'Value',
		color = 'var(--chart-1)',
		format = (value: number) => value.toLocaleString()
	}: {
		data: { label: string; value: number }[];
		label?: string;
		color?: string;
		/** The value printed after each bar (counts by default). */
		format?: (value: number) => string;
	} = $props();

	// Fixed row geometry: a 14 px bar with 20 px above it for its label.
	const BAR = 14;
	const LABEL_SPACE = 20;
	const STEP = BAR + LABEL_SPACE;
	const BAND_PADDING = LABEL_SPACE / STEP;
	// d3's band scale spreads n bands over n + padding steps (the outer padding is half a gap per side).
	const height = $derived(Math.round(STEP * (data.length + BAND_PADDING)));

	const config = $derived({ value: { label, color } }) satisfies Chart.ChartConfig;
</script>

<Chart.Container {config} class="aspect-auto w-full" style="height: {height}px">
	<BarChart
		{data}
		y="label"
		x="value"
		orientation="horizontal"
		series={[{ key: 'value', label, color }]}
		bandPadding={BAND_PADDING}
		axis="y"
		grid={false}
		rule={false}
		labels={{ offset: 6, format: (value: number) => format(value) }}
		padding={{ top: 0, left: 0, bottom: 0, right: 40 }}
		props={{
			yAxis: {
				tickLength: 0,
				tickLabelProps: {
					textAnchor: 'start',
					verticalAnchor: 'end',
					dx: 0,
					dy: -(BAR / 2 + 4),
					class: 'fill-foreground'
				}
			}
		}}
	>
		{#snippet tooltip()}
			<Chart.Tooltip indicator="dot" />
		{/snippet}
	</BarChart>
</Chart.Container>
