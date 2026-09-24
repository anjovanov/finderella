<script lang="ts">
	import { onMount } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Tv01Icon } from '@hugeicons/core-free-icons';
	import { mediaHref } from '$lib/data';
	import * as Empty from '$lib/components/ui/empty';
	import ActiveStreamCard from '$lib/components/stats/active-stream-card.svelte';
	import HistoryTable from '$lib/components/stats/history-table.svelte';
	import PeriodToggle from '$lib/components/stats/period-toggle.svelte';
	import PosterThumb from '$lib/components/stats/poster-thumb.svelte';
	import StatTile from '$lib/components/stats/stat-tile.svelte';
	import TopList from '$lib/components/stats/top-list.svelte';
	import UserCell from '$lib/components/stats/user-cell.svelte';
	import * as Card from '$lib/components/ui/card';
	import { formatBitrate } from '$lib/data/media-format';
	import { formatWatchTime } from '$lib/data/time';
	import type { ActiveStream, TopEntry, TopTitle } from '$lib/data/stats';

	let { data, form } = $props();

	// Live list: the load's snapshot, then a poll every 5 s. A poll result
	// belongs to the snapshot it replaced, so a fresh load (after Stop stream)
	// wins over an older poll.
	let polled = $state.raw<{ streams: ActiveStream[]; at: number; base: ActiveStream[] } | null>(
		null
	);
	const current = $derived(polled?.base === data.streams ? polled : null);
	const streams = $derived(current?.streams ?? data.streams);
	const loadedAt = $derived.by(() => {
		void data.streams;
		return Date.now();
	});
	const fetchedAt = $derived(current?.at ?? loadedAt);
	let now = $state(Date.now());

	onMount(() => {
		const poll = setInterval(async () => {
			try {
				const res = await fetch('/admin/statistics/activity');
				if (res.ok) polled = { streams: await res.json(), at: Date.now(), base: data.streams };
			} catch {
				// keep the last snapshot
			}
		}, 5_000);
		const tick = setInterval(() => (now = Date.now()), 1_000);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
		};
	});

	const bandwidth = $derived(streams.reduce((sum, s) => sum + s.bitrateBps, 0));
	const transcoding = $derived(streams.filter((s) => s.mode === 'hls').length);
</script>

<svelte:head>
	<title>Statistics · Finderella</title>
</svelte:head>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-lg font-semibold">Now playing</h2>
		{#if streams.length}
			<p class="text-sm text-muted-foreground">
				{streams.length}
				{streams.length === 1 ? 'stream' : 'streams'} · {transcoding} transcoding · {formatBitrate(
					bandwidth
				)}
			</p>
		{/if}
	</div>
	{#if form?.message}
		<p class="text-sm text-destructive">{form.message}</p>
	{/if}
	{#if streams.length === 0}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon">
					<HugeiconsIcon icon={Tv01Icon} />
				</Empty.Media>
				<Empty.Title>Nothing is playing</Empty.Title>
				<Empty.Description>Streams show up here as soon as someone presses play.</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each streams as stream (stream.sessionId)}
				<ActiveStreamCard {stream} {fetchedAt} {now} />
			{/each}
		</div>
	{/if}
</section>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-lg font-semibold">Watch statistics</h2>
		<PeriodToggle days={data.days} />
	</div>
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		<StatTile label="Plays" value={data.totals.plays.toLocaleString()} />
		<StatTile label="Watch time" value={formatWatchTime(data.totals.playedSeconds)} />
		<StatTile label="Viewers" value={data.totals.viewers.toLocaleString()} />
		<StatTile
			label="Transcoded"
			value="{Math.round(data.totals.transcodedShare * 100)}%"
			hint="of plays"
		/>
	</div>

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
				{item.viewers}
				{item.viewers === 1 ? 'viewer' : 'viewers'} · {formatWatchTime(item.playedSeconds)}
			</span>
		</div>
		<span class="text-sm tabular-nums">{item.plays}</span>
	{/snippet}

	{#snippet userRow(item: TopEntry)}
		<div class="min-w-0 flex-1"><UserCell user={item.user ?? null} /></div>
		<span class="text-sm text-muted-foreground tabular-nums"
			>{formatWatchTime(item.playedSeconds)}</span
		>
	{/snippet}

	{#snippet platformRow(item: TopEntry)}
		<span class="min-w-0 flex-1 truncate">{item.label}</span>
		<span class="text-sm tabular-nums">{item.plays}</span>
	{/snippet}

	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		<TopList title="Most watched movies" items={data.movies} row={titleRow} />
		<TopList title="Most watched shows" items={data.shows} row={titleRow} />
		<TopList title="Most active users" items={data.users} row={userRow} />
		<TopList title="Most used platforms" items={data.platforms} row={platformRow} />
	</div>
</section>

<section class="flex flex-col gap-4">
	<h2 class="text-lg font-semibold">Recently watched</h2>
	<Card.Root size="sm">
		<Card.Content class="overflow-x-auto">
			{#if data.recent.length}
				<HistoryTable entries={data.recent} />
			{:else}
				<p class="text-sm text-muted-foreground">No plays recorded yet.</p>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
