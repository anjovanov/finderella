<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	// A password field with a show/hide toggle. Accepts every prop Input does.
	let {
		class: className,
		...restProps
	}: Omit<ComponentProps<typeof Input>, 'type' | 'files'> = $props();

	let visible = $state(false);
</script>

<div class="relative">
	<Input type={visible ? 'text' : 'password'} class={cn('pr-10', className)} {...restProps} />
	<button
		type="button"
		class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-4xl text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground"
		aria-label={visible ? 'Hide password' : 'Show password'}
		aria-pressed={visible}
		tabindex={-1}
		onclick={() => (visible = !visible)}
	>
		{#if visible}
			<HugeiconsIcon icon={ViewOffIcon} class="size-4" />
		{:else}
			<HugeiconsIcon icon={ViewIcon} class="size-4" />
		{/if}
	</button>
</div>
