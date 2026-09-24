<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import PlatformLabel from '$lib/components/stats/platform-label.svelte';
	import TitleLink from '$lib/components/stats/title-link.svelte';
	import TablePagination from '$lib/components/stats/table-pagination.svelte';
	import UserCell from '$lib/components/stats/user-cell.svelte';
	import { formatRelative, formatWatchTime } from '$lib/data/time';
	import type { UserSortKey } from '$lib/data/stats';

	let { data } = $props();

	const sort = $derived(data.sort);

	/** Same column flips the direction; a new column starts at its natural order. Back to page 1 either way. */
	function sortBy(key: UserSortKey) {
		const desc = sort.key === key ? !sort.desc : key !== 'name';
		const url = new URL(page.url);
		url.searchParams.set('sort', key);
		url.searchParams.set('dir', desc ? 'desc' : 'asc');
		url.searchParams.delete('page');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, new query
		void goto(url, { noScroll: true, keepFocus: true });
	}

	const now = Date.now();
</script>

<svelte:head>
	<title>User statistics · Finderella</title>
</svelte:head>

{#snippet header(key: UserSortKey, label: string, align: 'left' | 'right' = 'left')}
	<Table.Head
		class={align === 'right' ? 'text-right' : undefined}
		aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}
	>
		<button
			type="button"
			class="inline-flex items-center gap-1 font-medium hover:text-foreground"
			onclick={() => sortBy(key)}
		>
			{label}
			{#if sort.key === key}
				<HugeiconsIcon icon={sort.desc ? ArrowDown01Icon : ArrowUp01Icon} class="size-3.5" />
			{/if}
		</button>
	</Table.Head>
{/snippet}

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>Users</Card.Title>
		<Card.Description>
			Every account's activity and watch totals, all time · {data.total.toLocaleString()}
			{data.total === 1 ? 'account' : 'accounts'}
		</Card.Description>
	</Card.Header>
	<Card.Content class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					{@render header('name', 'User')}
					{@render header('lastSeen', 'Last seen')}
					{@render header('lastPlayed', 'Last played')}
					<Table.Head>Last platform</Table.Head>
					{@render header('plays', 'Plays', 'right')}
					{@render header('duration', 'Watch time', 'right')}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as row (row.user.id)}
					<Table.Row>
						<Table.Cell class="max-w-56">
							<div class="flex items-center gap-2">
								<UserCell user={row.user} size="default" />
								{#if row.user.isAdmin}<Badge variant="secondary">Admin</Badge>{/if}
								{#if row.user.banned}<Badge variant="destructive">Banned</Badge>{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							{row.lastSeenAt ? formatRelative(row.lastSeenAt, now) : 'Never'}
						</Table.Cell>
						<Table.Cell class="max-w-64">
							{#if row.lastPlayed}
								<div class="flex flex-col">
									<TitleLink title={row.lastPlayed.title} />
									<span class="text-xs text-muted-foreground">
										{formatRelative(row.lastPlayed.at, now)}
									</span>
								</div>
							{:else}
								<span class="text-muted-foreground">Nothing yet</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="max-w-48"><PlatformLabel platform={row.lastPlatform} /></Table.Cell>
						<Table.Cell class="text-right tabular-nums">{row.plays.toLocaleString()}</Table.Cell>
						<Table.Cell class="text-right tabular-nums"
							>{formatWatchTime(row.playedSeconds)}</Table.Cell
						>
					</Table.Row>
				{/each}
				{#if data.guests}
					<Table.Row>
						<Table.Cell><UserCell user={null} size="default" /></Table.Cell>
						<Table.Cell class="text-muted-foreground">—</Table.Cell>
						<Table.Cell class="max-w-64">
							{#if data.guests.lastPlayed}
								<div class="flex flex-col">
									<TitleLink title={data.guests.lastPlayed.title} />
									<span class="text-xs text-muted-foreground">
										{formatRelative(data.guests.lastPlayed.at, now)}
									</span>
								</div>
							{/if}
						</Table.Cell>
						<Table.Cell class="max-w-48"
							><PlatformLabel platform={data.guests.lastPlatform} /></Table.Cell
						>
						<Table.Cell class="text-right tabular-nums"
							>{data.guests.plays.toLocaleString()}</Table.Cell
						>
						<Table.Cell class="text-right tabular-nums">
							{formatWatchTime(data.guests.playedSeconds)}
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</Card.Content>
	{#if data.total > data.perPage}
		<Card.Footer>
			<TablePagination total={data.total} perPage={data.perPage} page={data.page} />
		</Card.Footer>
	{/if}
</Card.Root>
