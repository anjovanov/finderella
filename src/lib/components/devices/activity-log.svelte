<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		CheckmarkCircle02Icon,
		FolderAddIcon,
		FolderRemoveIcon,
		Image01Icon,
		ImageDone01Icon,
		Link01Icon,
		PencilEdit01Icon,
		RefreshIcon,
		Unlink01Icon
	} from '@hugeicons/core-free-icons';
	import TablePagination from '$lib/components/stats/table-pagination.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import {
		DEVICE_EVENT_LABELS,
		describeDeviceEvent,
		type DeviceEventEntry,
		type DeviceEventType
	} from '$lib/data/device-events';
	import { formatRelative } from '$lib/data/time';

	let {
		events
	}: {
		events: { entries: DeviceEventEntry[]; total: number; page: number; perPage: number };
	} = $props();

	const ICONS: Record<DeviceEventType, typeof Link01Icon> = {
		'device.paired': Link01Icon,
		'device.renamed': PencilEdit01Icon,
		'device.revoked': Unlink01Icon,
		'library.added': FolderAddIcon,
		'library.removed': FolderRemoveIcon,
		'scan.started': RefreshIcon,
		'scan.finished': CheckmarkCircle02Icon,
		'thumbnails.started': Image01Icon,
		'thumbnails.finished': ImageDone01Icon
	};
	/** Removals read red; completions read in the accent; the rest stay neutral. */
	function tone(type: DeviceEventType): string {
		if (type === 'device.revoked' || type === 'library.removed')
			return 'bg-destructive/10 text-destructive';
		if (type === 'device.paired' || type === 'library.added' || type.endsWith('.finished'))
			return 'bg-primary/10 text-primary';
		return 'bg-muted text-muted-foreground';
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Activity log</Card.Title>
		<Card.Description>
			Pairings, libraries, scans and thumbnail runs on every device, newest first.
		</Card.Description>
	</Card.Header>
	<Card.Content class="overflow-x-auto">
		{#if events.entries.length === 0}
			<p class="text-sm text-muted-foreground">
				Nothing logged yet. Pairing a device, adding a library or running a scan shows up here.
			</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>When</Table.Head>
						<Table.Head>Event</Table.Head>
						<Table.Head>Device</Table.Head>
						<Table.Head>Library</Table.Head>
						<Table.Head>Details</Table.Head>
						<Table.Head>By</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each events.entries as entry (entry.id)}
						{@const detail = describeDeviceEvent(entry)}
						<Table.Row>
							<Table.Cell class="whitespace-nowrap text-muted-foreground">
								<span title={new Date(entry.at).toLocaleString()}>{formatRelative(entry.at)}</span>
							</Table.Cell>
							<Table.Cell>
								<span class="flex items-center gap-2.5 whitespace-nowrap">
									<span
										class={['grid size-7 shrink-0 place-items-center rounded-lg', tone(entry.type)]}
										aria-hidden="true"
									>
										<HugeiconsIcon icon={ICONS[entry.type]} class="size-4" />
									</span>
									<span class="font-medium">{DEVICE_EVENT_LABELS[entry.type]}</span>
								</span>
							</Table.Cell>
							<Table.Cell class="max-w-48 truncate" title={entry.gatewayName ?? undefined}>
								{entry.gatewayName ?? '—'}
							</Table.Cell>
							<Table.Cell class="max-w-48 truncate" title={entry.libraryName ?? undefined}>
								{entry.libraryName ?? '—'}
							</Table.Cell>
							<Table.Cell
								class="max-w-96 truncate text-muted-foreground"
								title={detail ?? undefined}
							>
								{detail ?? '—'}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{#if entry.actorName}
									{entry.actorName}
								{:else}
									<span class="text-muted-foreground">Automatic</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</Card.Content>
	{#if events.total > events.perPage}
		<Card.Footer>
			<TablePagination total={events.total} perPage={events.perPage} page={events.page} noScroll />
		</Card.Footer>
	{/if}
</Card.Root>
