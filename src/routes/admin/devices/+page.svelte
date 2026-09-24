<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Add01Icon, AlertCircleIcon, HardDriveIcon } from '@hugeicons/core-free-icons';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import ActivityLog from '$lib/components/devices/activity-log.svelte';
	import DeviceCard from '$lib/components/devices/device-card.svelte';
	import PairingDialog from '$lib/components/devices/pairing-dialog.svelte';
	import ThumbnailJobCard from '$lib/components/devices/thumbnail-job-card.svelte';
	import type { Device, DeviceLibrary, ThumbnailJob } from '$lib/components/devices/types';
	import { formatRelative } from '$lib/data/time';
	import { DialogForm } from '$lib/dialog-form.svelte';

	let { data, form } = $props();

	// Live thumbnail-job progress: poll while a run is active, then refresh the page data once.
	let job = $derived<ThumbnailJob>(data.trickplayJob);
	onMount(() => {
		let wasRunning = job.running;
		const timer = setInterval(async () => {
			if (!job.running && !wasRunning) return;
			try {
				const res = await fetch('/admin/devices/trickplay-status');
				if (res.ok) job = await res.json();
			} catch {
				// keep the last snapshot
			}
			if (wasRunning && !job.running) await invalidateAll();
			wasRunning = job.running;
		}, 2000);
		return () => clearInterval(timer);
	});

	const summary = $derived.by(() => {
		const devices = data.gateways.length;
		const online = data.gateways.filter((d) => d.online).length;
		const libraries = data.gateways.reduce((n, d) => n + d.libraries.length, 0);
		const files = data.gateways.reduce(
			(n, d) => n + d.libraries.reduce((m, lib) => m + lib.files, 0),
			0
		);
		const plural = (n: number, word: string) =>
			`${n.toLocaleString()} ${n === 1 ? word : `${word}s`}`;
		return [
			plural(devices, 'device'),
			`${online} online`,
			libraries === 1 ? '1 library' : `${libraries} libraries`,
			plural(files, 'file')
		].join(' · ');
	});

	let pairOpen = $state(false);

	// One dialog of each kind for the whole page.
	const rename = new DialogForm<Device>();
	const addLibrary = new DialogForm<Device>();
	const revoke = new DialogForm<Device>();
	const removeLibrary = new DialogForm<DeviceLibrary>();
	let addKind = $state<'movie' | 'series'>('movie');

	const kindOptions = [
		{ value: 'movie', label: 'Movies' },
		{ value: 'series', label: 'Series' }
	] as const;
	const addKindLabel = $derived(kindOptions.find((k) => k.value === addKind)?.label ?? 'Movies');
</script>

<svelte:head>
	<title>Devices · Finderella</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Devices</h1>
		<p class="text-sm text-muted-foreground">
			{#if data.gateways.length > 0}
				{summary}
			{:else}
				Computers and NAS boxes that stream your media to this server.
			{/if}
		</p>
	</div>
	{#if data.gateways.length > 0}
		<Button onclick={() => (pairOpen = true)}>
			<HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
			Pair a device
		</Button>
	{/if}
</div>

{#if form && 'message' in form && form.message}
	<Alert.Root variant="destructive">
		<HugeiconsIcon icon={AlertCircleIcon} />
		<Alert.Title>{form.message}</Alert.Title>
	</Alert.Root>
{/if}

{#if job.running || job.finishedAt}
	<ThumbnailJobCard {job} />
{/if}

{#if data.gateways.length === 0}
	<Empty.Root class="border border-dashed">
		<Empty.Header>
			<Empty.Media variant="icon">
				<HugeiconsIcon icon={HardDriveIcon} />
			</Empty.Media>
			<Empty.Title>No devices yet</Empty.Title>
			<Empty.Description>
				Pair the computer or NAS that holds your movies and series. It streams them through this
				server, so nothing is uploaded.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button onclick={() => (pairOpen = true)}>
				<HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
				Pair a device
			</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	{#each data.gateways as device (device.id)}
		<DeviceCard
			{device}
			trickplayEnabled={data.trickplayEnabled}
			jobRunning={job.running}
			onRename={() => rename.show(device)}
			onAddLibrary={() => {
				addKind = 'movie';
				addLibrary.show(device);
			}}
			onRevoke={() => revoke.show(device)}
			onRemoveLibrary={(library) => removeLibrary.show(library)}
		/>
	{/each}
{/if}

{#if data.pendingCodes.length > 0}
	<section class="flex flex-col gap-2">
		<h2 class="text-sm font-medium text-muted-foreground">Unused pairing codes</h2>
		<ul class="flex flex-wrap gap-2">
			{#each data.pendingCodes as code (code.code)}
				<li
					class="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1.5 text-xs"
				>
					<span class="rounded-full bg-muted px-2 py-0.5 font-mono font-medium tracking-wider">
						{code.code}
					</span>
					<span>{code.gatewayName}</span>
					<span class="text-muted-foreground">expires {formatRelative(code.expiresAt)}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<ActivityLog events={data.events} />

<PairingDialog bind:open={pairOpen} pendingCodes={data.pendingCodes} />

<!-- Rename -->
<Dialog.Root bind:open={rename.open}>
	<Dialog.Content>
		{#if rename.target}
			<form
				method="POST"
				action="?/renameGateway"
				class="flex flex-col gap-6"
				use:enhance={rename.submit}
			>
				<Dialog.Header>
					<Dialog.Title>Rename device</Dialog.Title>
				</Dialog.Header>
				<input type="hidden" name="gatewayId" value={rename.target.id} />
				<Field.Field data-invalid={rename.error ? true : undefined}>
					<Field.Label for="rename-name">Name</Field.Label>
					<Input
						id="rename-name"
						name="name"
						value={rename.target.name}
						required
						autocomplete="off"
						aria-invalid={rename.error ? true : undefined}
					/>
					{#if rename.error}<Field.Error>{rename.error}</Field.Error>{/if}
				</Field.Field>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={rename.close}>Cancel</Button>
					<Button type="submit" disabled={rename.busy}>Save</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Add library -->
<Dialog.Root bind:open={addLibrary.open}>
	<Dialog.Content>
		{#if addLibrary.target}
			<form
				method="POST"
				action="?/addLibrary"
				class="flex flex-col gap-6"
				use:enhance={addLibrary.submit}
			>
				<Dialog.Header>
					<Dialog.Title>Add a library</Dialog.Title>
					<Dialog.Description>
						Pick a folder on {addLibrary.target.name}. It's scanned right away and its videos join
						the catalog.
					</Dialog.Description>
				</Dialog.Header>
				<input type="hidden" name="gatewayId" value={addLibrary.target.id} />
				<Field.Group>
					<Field.Field data-invalid={addLibrary.error ? true : undefined}>
						<Field.Label for="library-path">Folder path</Field.Label>
						<Input
							id="library-path"
							name="rootPath"
							placeholder="/srv/media/Movies"
							class="font-mono"
							required
							autocomplete="off"
							aria-invalid={addLibrary.error ? true : undefined}
						/>
						<Field.Description>The full path as the device sees it.</Field.Description>
						{#if addLibrary.error}<Field.Error>{addLibrary.error}</Field.Error>{/if}
					</Field.Field>
					<div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
						<Field.Field>
							<Field.Label for="library-name">Name</Field.Label>
							<Input id="library-name" name="name" placeholder="Folder name" autocomplete="off" />
						</Field.Field>
						<Field.Field>
							<Field.Label for="library-kind">Contains</Field.Label>
							<Select.Root type="single" name="kind" bind:value={addKind}>
								<Select.Trigger id="library-kind" class="w-full">{addKindLabel}</Select.Trigger>
								<Select.Content>
									{#each kindOptions as option (option.value)}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</Field.Field>
					</div>
				</Field.Group>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={addLibrary.close}>Cancel</Button>
					<Button type="submit" disabled={addLibrary.busy}>
						{addLibrary.busy ? 'Adding…' : 'Add library'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Revoke device -->
<AlertDialog.Root bind:open={revoke.open}>
	<AlertDialog.Content>
		{#if revoke.target}
			<AlertDialog.Header>
				<AlertDialog.Title>Revoke {revoke.target.name}?</AlertDialog.Title>
				<AlertDialog.Description>
					It disconnects now and has to be paired again to come back. Its libraries and files are
					removed from this server; nothing is deleted on the device.
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if revoke.error}<p class="text-sm text-destructive">{revoke.error}</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<form method="POST" action="?/revokeGateway" use:enhance={revoke.submit}>
					<input type="hidden" name="gatewayId" value={revoke.target.id} />
					<Button type="submit" variant="destructive" class="w-full" disabled={revoke.busy}>
						Revoke device
					</Button>
				</form>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Remove library -->
<AlertDialog.Root bind:open={removeLibrary.open}>
	<AlertDialog.Content>
		{#if removeLibrary.target}
			<AlertDialog.Header>
				<AlertDialog.Title>Remove {removeLibrary.target.name}?</AlertDialog.Title>
				<AlertDialog.Description>
					Its {removeLibrary.target.files.toLocaleString()}
					{removeLibrary.target.files === 1 ? 'file leaves' : 'files leave'} the catalog. Nothing is deleted
					from the device, and you can add the folder again later.
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if removeLibrary.error}<p class="text-sm text-destructive">{removeLibrary.error}</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<form method="POST" action="?/removeLibrary" use:enhance={removeLibrary.submit}>
					<input type="hidden" name="libraryId" value={removeLibrary.target.id} />
					<Button type="submit" variant="destructive" class="w-full" disabled={removeLibrary.busy}>
						Remove library
					</Button>
				</form>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
