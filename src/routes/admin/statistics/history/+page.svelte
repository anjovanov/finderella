<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import HistoryTable from '$lib/components/stats/history-table.svelte';
	import TablePagination from '$lib/components/stats/table-pagination.svelte';
	import { STAT_PERIODS } from '$lib/data/stats';

	let { data } = $props();

	/** Change one filter; any filter change starts over at page 1. */
	function setParam(key: string, value: string | null) {
		const url = new URL(page.url);
		if (value === null || value === 'all') url.searchParams.delete(key);
		else url.searchParams.set(key, value);
		url.searchParams.delete('page');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, new query
		void goto(url, { noScroll: true, keepFocus: true });
	}

	const userLabel = $derived(
		data.filter.user === 'all'
			? 'All users'
			: data.filter.user === 'guest'
				? 'Guests'
				: (data.users.find((u) => u.id === data.filter.user)?.name ?? 'Unknown user')
	);
	const kindLabels: Record<string, string> = {
		all: 'Everything',
		movie: 'Movies',
		episode: 'Episodes'
	};
	const first = $derived((data.history.page - 1) * data.history.perPage + 1);
	const last = $derived(Math.min(data.history.total, data.history.page * data.history.perPage));
</script>

<svelte:head>
	<title>Watch history · Finderella</title>
</svelte:head>

<div class="flex flex-wrap items-center gap-3">
	<Select.Root type="single" value={data.filter.user} onValueChange={(v) => setParam('user', v)}>
		<Select.Trigger class="w-48" aria-label="User">{userLabel}</Select.Trigger>
		<Select.Content class="max-h-72">
			<Select.Group>
				<Select.Item value="all">All users</Select.Item>
				<Select.Item value="guest">Guests</Select.Item>
				{#each data.users as user (user.id)}
					<Select.Item value={user.id}>{user.name}</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
	<Select.Root type="single" value={data.filter.kind} onValueChange={(v) => setParam('kind', v)}>
		<Select.Trigger class="w-36" aria-label="Type">{kindLabels[data.filter.kind]}</Select.Trigger>
		<Select.Content>
			<Select.Group>
				{#each Object.entries(kindLabels) as [value, label] (value)}
					<Select.Item {value}>{label}</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		size="sm"
		value={data.filter.days ? String(data.filter.days) : 'all'}
		onValueChange={(v) => v && setParam('days', v)}
		aria-label="Time period"
	>
		{#each STAT_PERIODS as period (period.days)}
			<ToggleGroup.Item value={String(period.days)}>{period.label}</ToggleGroup.Item>
		{/each}
		<ToggleGroup.Item value="all">All time</ToggleGroup.Item>
	</ToggleGroup.Root>
</div>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>Watch history</Card.Title>
		<Card.Description>
			{#if data.history.total}
				{first}–{last} of {data.history.total.toLocaleString()} plays
			{:else}
				No plays match these filters.
			{/if}
		</Card.Description>
	</Card.Header>
	{#if data.history.entries.length}
		<Card.Content class="overflow-x-auto">
			<HistoryTable entries={data.history.entries} />
		</Card.Content>
	{/if}
	{#if data.history.total > data.history.perPage}
		<Card.Footer>
			<TablePagination
				total={data.history.total}
				perPage={data.history.perPage}
				page={data.history.page}
			/>
		</Card.Footer>
	{/if}
</Card.Root>
