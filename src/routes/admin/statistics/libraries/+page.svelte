<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import PosterThumb from '$lib/components/stats/poster-thumb.svelte';
	import RankChart from '$lib/components/stats/rank-chart.svelte';
	import StatTile from '$lib/components/stats/stat-tile.svelte';
	import TablePagination from '$lib/components/stats/table-pagination.svelte';
	import TitleLink from '$lib/components/stats/title-link.svelte';
	import { audioCodecLabel, formatBytes, videoCodecLabel } from '$lib/data/media-format';
	import { resolutionLabel } from '$lib/playback-quality';
	import { formatRelative, formatWatchTime } from '$lib/data/time';
	import type { Breakdown } from '$lib/data/stats';

	let { data } = $props();
	const now = Date.now();

	const totals = $derived(data.libraries.totals);

	function selectLibrary(value: string) {
		const url = new URL(page.url);
		if (value === 'all') url.searchParams.delete('library');
		else url.searchParams.set('library', value);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, new query
		void goto(url, { noScroll: true, keepFocus: true });
	}
	const libraryLabel = $derived(
		data.libraries.options.find((l) => l.id === data.libraryId)?.name ?? 'All libraries'
	);

	// Top 8 per chart; labels through the same codec names the detail pages use.
	const chartRows = (rows: Breakdown[], label: (key: string) => string) =>
		rows.slice(0, 8).map((row) => ({
			label: row.label === 'Unknown' ? row.label : label(row.label),
			value: row.files
		}));
	const breakdownCards = $derived([
		{ title: 'Resolution', rows: chartRows(data.breakdowns.resolution, (k) => k) },
		{ title: 'Video codec', rows: chartRows(data.breakdowns.videoCodec, videoCodecLabel) },
		{ title: 'Container', rows: chartRows(data.breakdowns.container, (k) => k.toUpperCase()) },
		{ title: 'Audio codec', rows: chartRows(data.breakdowns.audioCodec, audioCodecLabel) }
	]);

	function resolution(width: number): string {
		const label = resolutionLabel(width);
		return label === '2160p' ? '4K' : label;
	}
</script>

<svelte:head>
	<title>Library statistics · Finderella</title>
</svelte:head>

<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
	<StatTile label="Files" value={totals.files.toLocaleString()} />
	<StatTile label="Total size" value={formatBytes(totals.bytes)} />
	<StatTile label="Total runtime" value={formatWatchTime(totals.durationSeconds)} />
	<StatTile label="Plays" value={totals.plays.toLocaleString()} hint="all time" />
</div>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>Libraries</Card.Title>
		<Card.Description>
			Active files per library; a title on several devices counts in each ·
			{data.libraries.total.toLocaleString()}
			{data.libraries.total === 1 ? 'library' : 'libraries'}
		</Card.Description>
	</Card.Header>
	<Card.Content class="overflow-x-auto">
		{#if data.libraries.rows.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Library</Table.Head>
						<Table.Head>Device</Table.Head>
						<Table.Head class="text-right">Titles</Table.Head>
						<Table.Head class="text-right">Seasons / episodes</Table.Head>
						<Table.Head class="text-right">Files</Table.Head>
						<Table.Head class="text-right">Size</Table.Head>
						<Table.Head class="text-right">Runtime</Table.Head>
						<Table.Head>Last scan</Table.Head>
						<Table.Head class="text-right">Plays</Table.Head>
						<Table.Head>Last played</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.libraries.rows as library (library.id)}
						<Table.Row>
							<Table.Cell>
								<div class="flex flex-col">
									<span class="font-medium">{library.name}</span>
									<span class="text-xs text-muted-foreground">
										{library.kind === 'movie' ? 'Movies' : 'Series'}
									</span>
								</div>
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								<span class="flex items-center gap-2">
									<span
										class={[
											'inline-block size-2 rounded-full',
											library.device.online ? 'bg-emerald-400' : 'bg-muted-foreground/50'
										]}
										aria-label={library.device.online ? 'online' : 'offline'}
									></span>
									{library.device.name}
								</span>
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{library.titles.toLocaleString()}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">
								{library.kind === 'series'
									? `${library.seasons.toLocaleString()} / ${library.episodes.toLocaleString()}`
									: '—'}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{library.files.toLocaleString()}</Table.Cell
							>
							<Table.Cell class="text-right whitespace-nowrap tabular-nums"
								>{formatBytes(library.bytes)}</Table.Cell
							>
							<Table.Cell class="text-right whitespace-nowrap tabular-nums">
								{formatWatchTime(library.durationSeconds)}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{library.lastScanAt ? formatRelative(library.lastScanAt, now) : 'Never'}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{library.plays.toLocaleString()}</Table.Cell
							>
							<Table.Cell class="max-w-56">
								{#if library.lastPlayed}
									<div class="flex flex-col">
										<TitleLink title={library.lastPlayed.title} />
										<span class="text-xs text-muted-foreground">
											{formatRelative(library.lastPlayed.at, now)}
										</span>
									</div>
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<p class="text-sm text-muted-foreground">No libraries yet — add one under Devices.</p>
		{/if}
	</Card.Content>
	{#if data.libraries.total > data.libraries.perPage}
		<Card.Footer>
			<TablePagination
				total={data.libraries.total}
				perPage={data.libraries.perPage}
				page={data.libraries.page}
			/>
		</Card.Footer>
	{/if}
</Card.Root>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-lg font-semibold">Media breakdown</h2>
		<Select.Root type="single" value={data.libraryId} onValueChange={selectLibrary}>
			<Select.Trigger class="w-56" aria-label="Library">{libraryLabel}</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Item value="all">All libraries</Select.Item>
					{#each data.libraries.options as library (library.id)}
						<Select.Item value={library.id}>{library.name} · {library.deviceName}</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	</div>
	<div class="grid gap-4 md:grid-cols-2">
		{#each breakdownCards as card (card.title)}
			<Card.Root size="sm">
				<Card.Header>
					<Card.Title>{card.title}</Card.Title>
					<Card.Description>Files</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if card.rows.length}
						<RankChart data={card.rows} label="Files" />
					{:else}
						<p class="text-sm text-muted-foreground">No files.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
</section>

<Card.Root size="sm">
	<Card.Header>
		<Card.Title>Recently added</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if data.recent.length}
			<ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{#each data.recent as file (file.id)}
					<li class="flex min-w-0 items-center gap-3">
						<PosterThumb src={file.title.posterUrl} class="w-10" />
						<div class="flex min-w-0 flex-1 flex-col">
							<TitleLink title={file.title} />
							<span class="truncate text-xs text-muted-foreground">
								{file.libraryName} · {formatBytes(file.bytes)} · {formatRelative(file.addedAt, now)}
							</span>
						</div>
						{#if file.width}<Badge variant="outline">{resolution(file.width)}</Badge>{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">Nothing added yet.</p>
		{/if}
	</Card.Content>
</Card.Root>
