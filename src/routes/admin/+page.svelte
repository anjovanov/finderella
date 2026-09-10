<script lang="ts">
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		Film01Icon,
		HardDriveIcon,
		Settings01Icon,
		Tv01Icon,
		UserGroupIcon
	} from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	let { data } = $props();

	const tiles = $derived([
		{
			label: 'Devices online',
			value: `${data.stats.devices.online} / ${data.stats.devices.total}`,
			icon: HardDriveIcon
		},
		{ label: 'Libraries', value: String(data.stats.libraries), icon: HardDriveIcon },
		{ label: 'Movies', value: String(data.stats.movies), icon: Film01Icon },
		{ label: 'Series', value: String(data.stats.series), icon: Tv01Icon },
		{ label: 'Media files', value: String(data.stats.files), icon: Film01Icon },
		{ label: 'Users', value: String(data.stats.users), icon: UserGroupIcon }
	]);
</script>

<svelte:head>
	<title>Admin · Finderella</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-semibold">Overview</h1>
	<p class="text-sm text-muted-foreground">What this Finderella server is serving right now.</p>
</div>

<div class="grid grid-cols-2 gap-4 md:grid-cols-3">
	{#each tiles as tile (tile.label)}
		<Card.Root>
			<Card.Header>
				<Card.Description class="flex items-center gap-2">
					<HugeiconsIcon icon={tile.icon} class="size-4" />
					{tile.label}
				</Card.Description>
				<Card.Title class="text-3xl font-semibold tabular-nums">{tile.value}</Card.Title>
			</Card.Header>
		</Card.Root>
	{/each}
</div>

<div class="flex flex-wrap gap-2">
	<Button href={resolve('/admin/devices')} variant="secondary">
		<HugeiconsIcon icon={HardDriveIcon} data-icon="inline-start" />
		Pair a device
	</Button>
	<Button href={resolve('/admin/users')} variant="secondary">
		<HugeiconsIcon icon={UserGroupIcon} data-icon="inline-start" />
		Manage users
	</Button>
	<Button href={resolve('/admin/settings')} variant="secondary">
		<HugeiconsIcon icon={Settings01Icon} data-icon="inline-start" />
		Site settings
	</Button>
</div>
