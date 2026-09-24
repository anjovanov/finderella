<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ArrowRight01Icon,
		Film01Icon,
		Folder01Icon,
		HardDriveIcon,
		PlayIcon,
		Tv01Icon,
		UserGroupIcon
	} from '@hugeicons/core-free-icons';
	import PosterThumb from '$lib/components/stats/poster-thumb.svelte';
	import StreamStateBadge from '$lib/components/stats/stream-state-badge.svelte';
	import TitleLink from '$lib/components/stats/title-link.svelte';
	import UserCell from '$lib/components/stats/user-cell.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import { Progress } from '$lib/components/ui/progress';
	import type { ActiveStream } from '$lib/data/stats';
	import { formatRelative, formatWatchTime } from '$lib/data/time';

	let { data } = $props();

	// "Now playing" follows the Statistics activity feed: the load's snapshot, then a poll
	// every 10 s. A poll belongs to the snapshot it replaced, so a fresh load wins.
	let polled = $state.raw<{ streams: ActiveStream[]; base: ActiveStream[] } | null>(null);
	const streams = $derived(polled?.base === data.streams ? polled.streams : data.streams);
	onMount(() => {
		const poll = setInterval(async () => {
			try {
				const res = await fetch('/admin/statistics/activity');
				if (res.ok) polled = { streams: await res.json(), base: data.streams };
			} catch {
				// keep the last snapshot
			}
		}, 10_000);
		return () => clearInterval(poll);
	});

	const n = (value: number) => value.toLocaleString();
	const transcoding = $derived(streams.filter((s) => s.mode === 'hls').length);

	const tiles = $derived([
		{
			label: 'Watching now',
			value: n(streams.length),
			hint: streams.length ? `${transcoding} transcoding` : 'Nothing playing',
			icon: PlayIcon,
			href: resolve('/admin/statistics')
		},
		{
			label: 'Devices online',
			value: `${data.stats.devices.online} / ${data.stats.devices.total}`,
			hint: `${n(data.stats.libraries)} ${data.stats.libraries === 1 ? 'library' : 'libraries'}`,
			icon: HardDriveIcon,
			href: resolve('/admin/devices')
		},
		{
			label: 'Movies',
			value: n(data.stats.movies),
			hint: 'In the catalog',
			icon: Film01Icon,
			href: resolve('/movies')
		},
		{
			label: 'Series',
			value: n(data.stats.series),
			hint: 'In the catalog',
			icon: Tv01Icon,
			href: resolve('/series')
		},
		{
			label: 'Media files',
			value: n(data.stats.files),
			hint: 'Across every library',
			icon: Folder01Icon,
			href: resolve('/admin/statistics/libraries')
		},
		{
			label: 'Users',
			value: n(data.stats.users),
			hint: 'Accounts on this server',
			icon: UserGroupIcon,
			href: resolve('/admin/users')
		}
	]);

	const week = $derived([
		{ label: 'Plays', value: n(data.week.plays) },
		{ label: 'Watch time', value: formatWatchTime(data.week.playedSeconds) },
		{ label: 'Viewers', value: n(data.week.viewers) },
		{ label: 'Transcoded', value: `${Math.round(data.week.transcodedShare * 100)}%` }
	]);
</script>

<svelte:head>
	<title>Admin · Finderella</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-semibold">Overview</h1>
	<p class="text-sm text-muted-foreground">What this Finderella server is serving right now.</p>
</div>

<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
	{#each tiles as tile (tile.label)}
		<a
			href={tile.href}
			class="group rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
		>
			<Card.Root size="sm" class="h-full transition-colors group-hover:bg-muted/40">
				<Card.Header>
					<Card.Description class="flex items-center gap-2">
						<HugeiconsIcon icon={tile.icon} class="size-4" />
						{tile.label}
					</Card.Description>
					<Card.Title class="text-2xl font-semibold tabular-nums">{tile.value}</Card.Title>
					<p class="text-xs text-muted-foreground">{tile.hint}</p>
				</Card.Header>
			</Card.Root>
		</a>
	{/each}
</div>

<div class="grid items-start gap-6 lg:grid-cols-3">
	<div class="flex flex-col gap-6 lg:col-span-2">
		<!-- Now playing -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Now playing</Card.Title>
				<Card.Description>Streams from every device, refreshed every few seconds.</Card.Description>
				<Card.Action>
					<Button href={resolve('/admin/statistics')} variant="ghost" size="sm">
						Activity
						<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
					</Button>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				{#if streams.length === 0}
					<Empty.Root class="border border-dashed p-8">
						<Empty.Header>
							<Empty.Media variant="icon">
								<HugeiconsIcon icon={Tv01Icon} />
							</Empty.Media>
							<Empty.Title>Nothing is playing</Empty.Title>
							<Empty.Description>
								Streams show up here as soon as someone presses play.
							</Empty.Description>
						</Empty.Header>
					</Empty.Root>
				{:else}
					<ul class="flex flex-col divide-y divide-border/60">
						{#each streams as stream (stream.sessionId)}
							{@const fraction = stream.durationSeconds
								? Math.min(1, stream.positionSeconds / stream.durationSeconds)
								: 0}
							<li class="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
								<PosterThumb src={stream.title.posterUrl} class="w-16 rounded-lg" />
								<div class="flex min-w-0 flex-1 flex-col gap-2.5">
									<div class="flex min-w-0 items-start justify-between gap-3">
										<TitleLink title={stream.title} />
										<StreamStateBadge state={stream.state} terminating={stream.terminating} />
									</div>
									<Progress value={fraction * 100} class="h-1" aria-label="Watch position" />
									<div
										class="flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground"
									>
										<UserCell user={stream.user} />
										<span class="shrink-0">
											{stream.mode === 'direct' ? 'Direct play' : 'Transcoding'} · {stream.device
												.name}
										</span>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Recently watched -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Recently watched</Card.Title>
				<Card.Action>
					<Button href={resolve('/admin/statistics/history')} variant="ghost" size="sm">
						History
						<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
					</Button>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				{#if data.recent.length === 0}
					<p class="text-sm text-muted-foreground">No plays recorded yet.</p>
				{:else}
					<ul class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
						{#each data.recent as entry (entry.id)}
							<li class="flex min-w-0 items-center gap-3">
								<PosterThumb src={entry.title.posterUrl} class="w-9" />
								<div class="flex min-w-0 flex-1 flex-col gap-1">
									<TitleLink title={entry.title} />
									<div class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
										<UserCell user={entry.user} />
										<span aria-hidden="true">·</span>
										<span class="shrink-0" title={new Date(entry.startedAt).toLocaleString()}>
											{formatRelative(entry.startedAt)}
										</span>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="flex flex-col gap-6">
		<!-- Devices -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Devices</Card.Title>
				<Card.Action>
					<Button href={resolve('/admin/devices')} variant="ghost" size="sm">
						Manage
						<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
					</Button>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				{#if data.devices.length === 0}
					<p class="text-sm text-muted-foreground">
						No devices yet. Pair the computer or NAS that holds your media to start streaming.
					</p>
					<Button href={resolve('/admin/devices')} class="mt-4" size="sm">Pair a device</Button>
				{:else}
					<ul class="flex flex-col gap-4">
						{#each data.devices as device (device.id)}
							<li class="flex items-start gap-3">
								<span
									class={[
										'mt-1.5 size-2 shrink-0 rounded-full',
										device.online ? 'bg-emerald-400' : 'bg-muted-foreground/40'
									]}
									aria-hidden="true"
								></span>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{device.name}</p>
									<p class="text-xs text-muted-foreground">
										{device.online
											? 'Online'
											: `Last seen ${device.lastSeenAt ? formatRelative(device.lastSeenAt) : 'never'}`}
										· {device.libraries}
										{device.libraries === 1 ? 'library' : 'libraries'} · {n(device.files)}
										{device.files === 1 ? 'file' : 'files'}
									</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Last 7 days -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Last 7 days</Card.Title>
				<Card.Action>
					<Button href={resolve('/admin/statistics/graphs')} variant="ghost" size="sm">
						Graphs
						<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
					</Button>
				</Card.Action>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-2 gap-3">
					{#each week as stat (stat.label)}
						<div class="rounded-xl bg-muted/50 px-3 py-2.5">
							<dt class="text-xs text-muted-foreground">{stat.label}</dt>
							<dd class="text-lg font-semibold tabular-nums">{stat.value}</dd>
						</div>
					{/each}
				</dl>
			</Card.Content>
		</Card.Root>
	</div>
</div>

<!-- Recently added -->
<Card.Root>
	<Card.Header>
		<Card.Title>Recently added</Card.Title>
		<Card.Action>
			<Button href={resolve('/admin/statistics/libraries')} variant="ghost" size="sm">
				Libraries
				<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		{#if data.added.length === 0}
			<p class="text-sm text-muted-foreground">Nothing scanned yet.</p>
		{:else}
			<ul class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
				{#each data.added as file (file.id)}
					<li class="flex min-w-0 flex-col gap-2">
						<PosterThumb src={file.title.posterUrl} class="w-full rounded-lg" />
						<div class="min-w-0 text-sm">
							<TitleLink title={file.title} />
							<p
								class="truncate text-xs text-muted-foreground"
								title={new Date(file.addedAt).toLocaleString()}
							>
								{#if file.newEpisodes > 1}{file.newEpisodes} new episodes ·{/if}
								{formatRelative(file.addedAt)}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
