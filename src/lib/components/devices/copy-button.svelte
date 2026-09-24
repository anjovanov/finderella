<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Copy01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
	import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button';

	let {
		text,
		label = 'Copy',
		showLabel = false,
		variant = 'ghost',
		size,
		class: className
	}: {
		text: string;
		/** Accessible name (and visible text when `showLabel`). */
		label?: string;
		showLabel?: boolean;
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
	} = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return; // insecure context / denied: the text stays selectable
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1600);
	}
</script>

<Button
	type="button"
	{variant}
	size={size ?? (showLabel ? 'sm' : 'icon-sm')}
	class={className}
	aria-label={showLabel ? undefined : copied ? 'Copied' : label}
	onclick={copy}
>
	<!-- HugeiconsIcon draws its icon once on mount, hence the {#if}. -->
	{#if copied}
		<HugeiconsIcon icon={Tick02Icon} class="text-primary" />
	{:else}
		<HugeiconsIcon icon={Copy01Icon} />
	{/if}
	{#if showLabel}{copied ? 'Copied' : label}{/if}
</Button>
