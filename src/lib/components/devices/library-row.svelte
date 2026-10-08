<script lang="ts">
	import { enhance } from '$app/forms';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		AudioWave01Icon,
		Delete02Icon,
		FileSearchIcon,
		Film01Icon,
		Image01Icon,
		MoreVerticalIcon,
		RefreshIcon,
		Tv01Icon
	} from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatBytes } from '$lib/data/media-format';
	import { formatRelative } from '$lib/data/time';
	import type { DeviceLibrary } from './types';

	let {
		library,
		online,
		thumbnailBlocker,
		markersBlocker,
		onRemove
	}: {
		library: DeviceLibrary;
		online: boolean;
		/** Why thumbnails can't be generated right now; null = they can. */
		thumbnailBlocker: string | null;
		/** Why intro/credits detection can't run right now; null = it can. */
		markersBlocker: string | null;
		onRemove: () => void;
	} = $props();

	/** The rescan request is in flight (the load then reports `scanState`). */
	let submitting = $state(false);
	let thumbnailForm = $state<HTMLFormElement>();
	let markersForm = $state<HTMLFormElement>();
	let fullRescanForm = $state<HTMLFormElement>();

	const busy = $derived(submitting || library.scanState !== null);
	const rescanLabel = $derived(
		library.scanState === 'queued'
			? 'Queued'
			: submitting || library.scanState === 'scanning'
				? 'Scanning…'
				: 'Rescan'
	);
	const rescanTitle = $derived(
		!online
			? 'Device is offline'
			: library.scanState === 'queued'
				? 'Waits for another scan on this device to finish'
				: 'Look for new, changed and removed files'
	);

	const kindLabel = $derived(library.kind === 'series' ? 'Series' : 'Movies');
	const filesLabel = $derived(
		`${library.files.toLocaleString()} ${library.files === 1 ? 'file' : 'files'}`
	);
	const sizeLabel = $derived(formatBytes(library.bytes));
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
			{filesLabel} · {sizeLabel} · {scannedLabel}
		</p>
	</div>

	<div class="hidden shrink-0 text-right sm:block">
		<p class="font-medium tabular-nums">
			{filesLabel} <span class="font-normal text-muted-foreground">· {sizeLabel}</span>
		</p>
		<p class="text-xs text-muted-foreground" title={scannedTitle}>{scannedLabel}</p>
	</div>

	<form
		method="POST"
		action="?/rescan"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<input type="hidden" name="libraryId" value={library.id} />
		<Button
			type="submit"
			variant="outline"
			size="sm"
			disabled={!online || busy}
			title={rescanTitle}
		>
			<HugeiconsIcon
				icon={RefreshIcon}
				class={busy && library.scanState !== 'queued' ? 'motion-safe:animate-spin' : ''}
			/>
			<span class="hidden sm:inline">{rescanLabel}</span>
		</Button>
	</form>

	<form bind:this={fullRescanForm} method="POST" action="?/rescan" class="hidden" use:enhance>
		<input type="hidden" name="libraryId" value={library.id} />
		<input type="hidden" name="force" value="true" />
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

	<form bind:this={markersForm} method="POST" action="?/detectMarkers" class="hidden" use:enhance>
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
				disabled={!online || busy}
				onSelect={() => fullRescanForm?.requestSubmit()}
			>
				<HugeiconsIcon icon={FileSearchIcon} />
				<div class="flex flex-col">
					<span>Full rescan</span>
					<span class="text-xs text-muted-foreground">
						{online ? 'Re-read every file’s tracks and chapters' : 'Device is offline'}
					</span>
				</div>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				disabled={thumbnailBlocker !== null}
				onSelect={() => thumbnailForm?.requestSubmit()}
			>
				<HugeiconsIcon icon={Image01Icon} />
				<div class="flex flex-col">
					<span>Regenerate trickplay thumbnails</span>
					<span class="text-xs text-muted-foreground">
						{thumbnailBlocker ?? 'Normally automatic. Re-checks every file in this library.'}
					</span>
				</div>
			</DropdownMenu.Item>
			<DropdownMenu.Item
				disabled={markersBlocker !== null}
				onSelect={() => markersForm?.requestSubmit()}
			>
				<HugeiconsIcon icon={AudioWave01Icon} />
				<div class="flex flex-col">
					<span>Re-detect intros & credits</span>
					<span class="text-xs text-muted-foreground">
						{markersBlocker ?? 'Normally automatic. Re-checks every file in this library.'}
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
