<script lang="ts" module>
	import {
		siAndroid,
		siApple,
		siFirefoxbrowser,
		siGooglechrome,
		siLinux,
		siOpera,
		siSafari,
		siVivaldi,
		type SimpleIcon
	} from 'simple-icons';

	// Brand logos come from simple-icons (hugeicons has no Firefox/Linux/Opera
	// marks). simple-icons has no Microsoft logos, so Windows uses hugeicons'
	// below and Edge gets the generic browser icon. Keys are parseUserAgent's names.
	const OS_LOGOS: Record<string, SimpleIcon> = {
		macOS: siApple,
		iOS: siApple,
		iPadOS: siApple,
		Android: siAndroid,
		Linux: siLinux
	};
	const BROWSER_LOGOS: Record<string, SimpleIcon> = {
		Chrome: siGooglechrome,
		Firefox: siFirefoxbrowser,
		Safari: siSafari,
		Opera: siOpera,
		Vivaldi: siVivaldi
	};
</script>

<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { BrowserIcon, WindowsNewIcon } from '@hugeicons/core-free-icons';
	import { DEVICE_ICONS } from '$lib/components/stats/platform-label.svelte';
	import type { AccountSession } from '$lib/data/account-sessions';

	let { session }: { session: Pick<AccountSession, 'os' | 'browser' | 'deviceType'> } = $props();

	const osLogo = $derived(session.os ? OS_LOGOS[session.os] : undefined);
	const browserLogo = $derived(session.browser ? BROWSER_LOGOS[session.browser] : undefined);
</script>

<!-- Monochrome: drawn in the text colour like the rest of the UI chrome. -->
{#snippet brand(icon: SimpleIcon, className: string)}
	<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class={className}>
		<path d={icon.path} />
	</svg>
{/snippet}

<!-- The OS (or, without a logo, the form factor) with the browser as a corner badge. -->
<div class="relative size-10 shrink-0">
	<div class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
		{#if osLogo}
			{@render brand(osLogo, 'size-[1.125rem]')}
		{:else if session.os === 'Windows'}
			<HugeiconsIcon icon={WindowsNewIcon} class="size-5" aria-hidden="true" />
		{:else}
			<HugeiconsIcon icon={DEVICE_ICONS[session.deviceType]} class="size-5" aria-hidden="true" />
		{/if}
	</div>
	{#if session.browser}
		<div
			class="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full bg-card text-foreground ring-2 ring-card"
		>
			{#if browserLogo}
				{@render brand(browserLogo, 'size-4')}
			{:else}
				<HugeiconsIcon icon={BrowserIcon} class="size-4" aria-hidden="true" />
			{/if}
		</div>
	{/if}
</div>
