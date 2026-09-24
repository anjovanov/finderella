<script lang="ts">
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import HistoryTable from '$lib/components/stats/history-table.svelte';
	import PlatformLabel from '$lib/components/stats/platform-label.svelte';
	import StatTile from '$lib/components/stats/stat-tile.svelte';
	import TitleLink from '$lib/components/stats/title-link.svelte';
	import TopList from '$lib/components/stats/top-list.svelte';
	import { formatRelative, formatWatchTime } from '$lib/data/time';
	import type { TopEntry } from '$lib/data/stats';

	let { data } = $props();
	const row = $derived(data.detail.row);
	const now = Date.now();
	const initials = $derived(
		row.user.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
</script>

<svelte:head>
	<title>{row.user.name} · Statistics · Finderella</title>
</svelte:head>

<div>
	<Button href={resolve('/admin/statistics/users')} variant="ghost" size="sm">
		<HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" />
		All users
	</Button>
</div>

<div class="flex flex-wrap items-center gap-4">
	<Avatar.Root class="size-14">
		{#if row.user.image}
			<Avatar.Image src={row.user.image} alt="" />
		{/if}
		<Avatar.Fallback class="bg-primary/15 text-lg font-semibold text-primary"
			>{initials}</Avatar.Fallback
		>
	</Avatar.Root>
	<div class="flex min-w-0 flex-col gap-1">
		<div class="flex items-center gap-2">
			<h2 class="truncate text-xl font-semibold">{row.user.name}</h2>
			{#if row.user.isAdmin}<Badge variant="secondary">Admin</Badge>{/if}
			{#if row.user.banned}<Badge variant="destructive">Banned</Badge>{/if}
		</div>
		<p class="truncate text-sm text-muted-foreground">{row.user.email}</p>
	</div>
</div>

<div class="grid gap-4 md:grid-cols-3">
	<Card.Root size="sm">
		<Card.Header>
			<Card.Description>Last seen</Card.Description>
			<Card.Title>{row.lastSeenAt ? formatRelative(row.lastSeenAt, now) : 'Never'}</Card.Title>
		</Card.Header>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Header>
			<Card.Description>Last played</Card.Description>
			{#if row.lastPlayed}
				<TitleLink title={row.lastPlayed.title} />
				<p class="text-xs text-muted-foreground">{formatRelative(row.lastPlayed.at, now)}</p>
			{:else}
				<Card.Title>Nothing yet</Card.Title>
			{/if}
		</Card.Header>
	</Card.Root>
	<Card.Root size="sm">
		<Card.Header>
			<Card.Description>Last platform</Card.Description>
			<PlatformLabel platform={row.lastPlatform} />
		</Card.Header>
	</Card.Root>
</div>

<section class="flex flex-col gap-4">
	<h3 class="text-lg font-semibold">Watch time</h3>
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#each data.detail.windows as window (window.label)}
			<StatTile
				label={window.label}
				value={formatWatchTime(window.playedSeconds)}
				hint="{window.plays.toLocaleString()} {window.plays === 1 ? 'play' : 'plays'}"
			/>
		{/each}
	</div>
</section>

{#snippet platformRow(item: TopEntry)}
	<span class="min-w-0 flex-1 truncate">{item.label}</span>
	<span class="text-sm text-muted-foreground tabular-nums"
		>{formatWatchTime(item.playedSeconds)}</span
	>
	<span class="w-10 text-right text-sm tabular-nums">{item.plays}</span>
{/snippet}

<div class="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
	<div>
		<TopList
			title="Platforms"
			items={data.detail.platforms}
			row={platformRow}
			empty="No plays yet."
		/>
	</div>
	<Card.Root size="sm" class="min-w-0">
		<Card.Header>
			<Card.Title>Recent history</Card.Title>
			<Card.Description>
				{#if data.recent.total > data.recent.entries.length}
					<a
						href="{resolve('/admin/statistics/history')}?user={encodeURIComponent(row.user.id)}"
						class="underline-offset-4 hover:underline"
					>
						See all {data.recent.total.toLocaleString()} plays
					</a>
				{:else}
					{data.recent.total.toLocaleString()} plays
				{/if}
			</Card.Description>
		</Card.Header>
		{#if data.recent.entries.length}
			<Card.Content class="overflow-x-auto">
				<HistoryTable entries={data.recent.entries} showUser={false} />
			</Card.Content>
		{/if}
	</Card.Root>
</div>
