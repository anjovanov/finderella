<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Delete02Icon,
		Film01Icon,
		Image01Icon,
		MoreVerticalIcon,
		RefreshIcon,
		Tv01Icon
	} from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatRelative } from '$lib/data/time';
	import type { DeviceLibrary } from './types';

	let {
		library,
		online,
		thumbnailBlocker,
		onRemove
	}: {
		library: DeviceLibrary;
		online: boolean;
		/** Why thumbnails can't be generated right now; null = they can. */
		thumbnailBlocker: string | null;
		onRemove: () => void;
	} = $props();

	let scanning = $state(false);
	let thumbnailForm = $state<HTMLFormElement>();

	const kindLabel = $derived(library.kind === 'series' ? 'Series' : 'Movies');
	const filesLabel = $derived(
		`${library.files.toLocaleString()} ${library.files === 1 ? 'file' : 'files'}`
	);
	const scannedLabel = $derived(
		library.lastScanAt ? `Scanned ${formatRelative(library.lastScanAt)}` : 'Not scanned yet'
	);
	const scannedTitle = $derived(
		library.lastScanAt ? new Date(library.lastScanAt).toLocaleString() : undefined
	);
</script>

<li class="flex items-center gap-3 px-(--card-spacing) py-3.5">
	<div
		class="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
		aria-hidden="true"
	>
		<HugeiconsIcon icon={library.kind === 'series' ? Tv01Icon : Film01Icon} class="size-5" />
	</div>

	<div class="min-w-0 flex-1">
		<p class="truncate font-medium">
			{library.name}
			{#if library.name.toLowerCase() !== kindLabel.toLowerCase()}
				<span class="ml-1 text-xs font-normal text-muted-foreground">{kindLabel}</span>
			{/if}
		</p>
		<p class="truncate font-mono text-xs text-muted-foreground" title={library.rootPath}>
			{library.rootPath}
		</p>
		<p class="mt-0.5 text-xs text-muted-foreground sm:hidden" title={scannedTitle}>
			{filesLabel} · {scannedLabel}
		</p>
	</div>

	<div class="hidden shrink-0 text-right sm:block">
		<p class="font-medium tabular-nums">{filesLabel}</p>
		<p class="text-xs text-muted-foreground" title={scannedTitle}>{scannedLabel}</p>
	</div>

	<form
		method="POST"
		action="?/rescan"
		use:enhance={() => {
			scanning = true;
			return async ({ update }) => {
				await update();
				// The scan runs on the device; give the first batches a moment before refreshing.
				setTimeout(async () => {
					await invalidateAll();
					scanning = false;
				}, 2000);
			};
		}}
	>
		<input type="hidden" name="libraryId" value={library.id} />
		<Button
			type="submit"
			variant="outline"
			size="sm"
			disabled={!online || scanning}
			title={online ? 'Look for new, changed and removed files' : 'Device is offline'}
		>
			<HugeiconsIcon icon={RefreshIcon} class={scanning ? 'motion-safe:animate-spin' : ''} />
			<span class="hidden sm:inline">{scanning ? 'Scanning…' : 'Rescan'}</span>
		</Button>
	</form>

	<form
		bind:this={thumbnailForm}
		method="POST"
		action="?/generateTrickplay"
		class="hidden"
		use:enhance
	>
		<input type="hidden" name="libraryId" value={library.id} />
	</form>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="icon-sm" aria-label="More for {library.name}">
					<HugeiconsIcon icon={MoreVerticalIcon} />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="min-w-72">
			<DropdownMenu.Item
				disabled={thumbnailBlocker !== null}
				onSelect={() => thumbnailForm?.requestSubmit()}
			>
				<HugeiconsIcon icon={Image01Icon} />
				<div class="flex flex-col">
					<span>Generate trickplay thumbnails</span>
					<span class="text-xs text-muted-foreground">
						{thumbnailBlocker ?? 'Seek-bar previews for every file'}
					</span>
				</div>
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive" onSelect={onRemove}>
				<HugeiconsIcon icon={Delete02Icon} />
				Remove library…
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</li>
