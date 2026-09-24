<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { STAT_PERIODS, type StatPeriod } from '$lib/data/stats';

	/** 7 / 30 / 90 days / 1 year, kept in `?days=` (the page's load re-runs). */
	let { days }: { days: StatPeriod } = $props();

	function select(value: string) {
		if (!value || Number(value) === days) return;
		const url = new URL(page.url);
		url.searchParams.set('days', value);
		// A new period starts the history over at its first page.
		url.searchParams.delete('page');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, new query
		void goto(url, { noScroll: true, keepFocus: true });
	}
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	size="sm"
	value={String(days)}
	onValueChange={select}
	aria-label="Time period"
>
	{#each STAT_PERIODS as period (period.days)}
		<ToggleGroup.Item value={String(period.days)}>{period.label}</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
