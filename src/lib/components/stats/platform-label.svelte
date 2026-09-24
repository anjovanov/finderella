<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		ComputerIcon,
		SmartPhone01Icon,
		Tablet01Icon,
		Tv01Icon,
		HelpCircleIcon
	} from '@hugeicons/core-free-icons';
	import { DEVICE_LABELS, platformLabel, type DeviceType, type Platform } from '$lib/data/stats';

	let { platform }: { platform: Platform | null } = $props();

	const icons: Record<DeviceType, typeof ComputerIcon> = {
		desktop: ComputerIcon,
		mobile: SmartPhone01Icon,
		tablet: Tablet01Icon,
		tv: Tv01Icon,
		unknown: HelpCircleIcon
	};
</script>

{#if platform}
	<span class="flex min-w-0 items-center gap-1.5" title={DEVICE_LABELS[platform.deviceType]}>
		<HugeiconsIcon
			icon={icons[platform.deviceType]}
			class="size-4 shrink-0 text-muted-foreground"
			aria-label={DEVICE_LABELS[platform.deviceType]}
		/>
		<span class="truncate">{platformLabel(platform)}</span>
	</span>
{:else}
	<span class="text-muted-foreground">—</span>
{/if}
