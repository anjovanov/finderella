<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import { formatBytes } from '$lib/data/media-format';
	import { formatWatchTime } from '$lib/data/time';
	import type { HistoryEntry } from '$lib/data/stats';
	import PlatformLabel from './platform-label.svelte';
	import TitleLink from './title-link.svelte';
	import UserCell from './user-cell.svelte';

	/** Watch-history rows; `showUser` off on a user's own page. */
	let { entries, showUser = true }: { entries: HistoryEntry[]; showUser?: boolean } = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
	const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

	function complete(entry: HistoryEntry): number | null {
		if (!entry.durationSeconds) return null;
		return Math.min(1, entry.positionSeconds / entry.durationSeconds);
	}
</script>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Date</Table.Head>
			{#if showUser}<Table.Head>User</Table.Head>{/if}
			<Table.Head>Title</Table.Head>
			<Table.Head>Platform</Table.Head>
			<Table.Head>Stream</Table.Head>
			<Table.Head>Started</Table.Head>
			<Table.Head>Stopped</Table.Head>
			<Table.Head class="text-right">Paused</Table.Head>
			<Table.Head class="text-right">Watched</Table.Head>
			<Table.Head>Progress</Table.Head>
			<Table.Head class="text-right">Data</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each entries as entry (entry.id)}
			{@const fraction = complete(entry)}
			<Table.Row>
				<Table.Cell class="whitespace-nowrap"
					>{dateFormat.format(new Date(entry.startedAt))}</Table.Cell
				>
				{#if showUser}
					<Table.Cell class="max-w-40"><UserCell user={entry.user} /></Table.Cell>
				{/if}
				<Table.Cell class="max-w-64"><TitleLink title={entry.title} /></Table.Cell>
				<Table.Cell class="max-w-48"><PlatformLabel platform={entry.platform} /></Table.Cell>
				<Table.Cell>
					{#if entry.transcoded}
						<Badge variant="secondary"
							>Transcode{entry.quality && entry.quality !== 'original'
								? ` · ${entry.quality}`
								: ''}</Badge
						>
					{:else}
						<Badge variant="outline">Direct play</Badge>
					{/if}
				</Table.Cell>
				<Table.Cell class="whitespace-nowrap tabular-nums">
					{timeFormat.format(new Date(entry.startedAt))}
				</Table.Cell>
				<Table.Cell class="whitespace-nowrap tabular-nums">
					{#if entry.stoppedAt}
						{timeFormat.format(new Date(entry.stoppedAt))}
					{:else}
						<Badge>Watching</Badge>
					{/if}
				</Table.Cell>
				<Table.Cell class="text-right tabular-nums"
					>{formatWatchTime(entry.pausedSeconds)}</Table.Cell
				>
				<Table.Cell class="text-right tabular-nums"
					>{formatWatchTime(entry.playedSeconds)}</Table.Cell
				>
				<Table.Cell>
					{#if fraction !== null}
						<div class="flex items-center gap-2">
							<div
								class="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/15"
								role="progressbar"
								aria-label="Progress"
								aria-valuemin="0"
								aria-valuemax="100"
								aria-valuenow={Math.round(fraction * 100)}
							>
								<div class="h-full rounded-full bg-primary" style:width="{fraction * 100}%"></div>
							</div>
							<span class="text-xs text-muted-foreground tabular-nums"
								>{Math.round(fraction * 100)}%</span
							>
						</div>
					{/if}
				</Table.Cell>
				<Table.Cell class="text-right whitespace-nowrap tabular-nums">
					{entry.bytesSent ? formatBytes(entry.bytesSent) : '—'}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
