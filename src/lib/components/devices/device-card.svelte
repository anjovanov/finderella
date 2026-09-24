<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		FolderAddIcon,
		MoreVerticalIcon,
		PencilEdit01Icon,
		Unlink01Icon
	} from '@hugeicons/core-free-icons';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatRelative } from '$lib/data/time';
	import LibraryRow from './library-row.svelte';
	import { thumbnailBlocker, type Device, type DeviceLibrary } from './types';

	let {
		device,
		trickplayEnabled,
		jobRunning,
		onRename,
		onRevoke,
		onAddLibrary,
		onRemoveLibrary
	}: {
		device: Device;
		trickplayEnabled: boolean;
		jobRunning: boolean;
		onRename: () => void;
		onRevoke: () => void;
		onAddLibrary: () => void;
		onRemoveLibrary: (library: DeviceLibrary) => void;
	} = $props();

	const blocker = $derived(thumbnailBlocker(device, { enabled: trickplayEnabled, jobRunning }));
	const pairedLabel = $derived(
		new Date(device.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
	);
</script>

<Card.Root class="gap-0 py-0">
	<div class="flex items-start gap-3 border-b border-border/60 px-(--card-spacing) py-5">
		<!-- Status light: a slow ping ring while the tunnel is up. -->
		<span class="relative mt-1.5 flex size-2.5 shrink-0" aria-hidden="true">
			{#if device.online}
				<span
					class="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping motion-safe:[animation-duration:2.4s]"
				></span>
			{/if}
			<span
				class={[
					'relative inline-flex size-2.5 rounded-full',
					device.online ? 'bg-emerald-400' : 'bg-muted-foreground/40'
				]}
			></span>
		</span>

		<div class="min-w-0 flex-1">
			<h2 class="truncate text-base font-medium">{device.name}</h2>
			<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
				{#if device.online}
					<span class="font-medium text-emerald-600 dark:text-emerald-400">Online</span>
				{:else}
					<span
						title={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : undefined}
					>
						Offline · last seen {device.lastSeenAt ? formatRelative(device.lastSeenAt) : 'never'}
					</span>
				{/if}
				{#if device.gatewayVersion}
					<span aria-hidden="true">·</span>
					<Badge variant="outline" class="tabular-nums">v{device.gatewayVersion}</Badge>
				{/if}
				<span aria-hidden="true">·</span>
				<span>paired {pairedLabel}</span>
			</p>
		</div>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon-sm" aria-label="Manage {device.name}">
						<HugeiconsIcon icon={MoreVerticalIcon} />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="min-w-48">
				<DropdownMenu.Item onSelect={onRename}>
					<HugeiconsIcon icon={PencilEdit01Icon} />
					Rename…
				</DropdownMenu.Item>
				<DropdownMenu.Item disabled={!device.online} onSelect={onAddLibrary}>
					<HugeiconsIcon icon={FolderAddIcon} />
					Add library…
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item variant="destructive" onSelect={onRevoke}>
					<HugeiconsIcon icon={Unlink01Icon} />
					Revoke device…
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	{#if device.libraries.length > 0}
		<ul class="divide-y divide-border/60">
			{#each device.libraries as library (library.id)}
				<LibraryRow
					{library}
					online={device.online}
					thumbnailBlocker={blocker}
					onRemove={() => onRemoveLibrary(library)}
				/>
			{/each}
		</ul>
	{:else}
		<p class="px-(--card-spacing) pt-5 text-sm text-muted-foreground">
			No libraries yet. Add a folder from this device to put its videos in the catalog.
		</p>
	{/if}

	<div class="px-(--card-spacing) py-4">
		<Button
			variant="ghost"
			size="sm"
			class="-ml-3 text-muted-foreground"
			disabled={!device.online}
			title={device.online ? undefined : 'Bring the device online to add a folder from it'}
			onclick={onAddLibrary}
		>
			<HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
			Add library
		</Button>
	</div>
</Card.Root>
