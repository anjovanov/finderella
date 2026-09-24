<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Tick02Icon } from '@hugeicons/core-free-icons';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import CopyButton from './copy-button.svelte';

	let {
		open = $bindable(false),
		pendingCodes
	}: {
		open?: boolean;
		/** Unclaimed, unexpired codes from the loader — a code leaving this list means it was used. */
		pendingCodes: { code: string }[];
	} = $props();

	interface Issued {
		code: string;
		name: string;
		issuedAt: number;
		expiresAt: number;
	}

	let issued = $state<Issued | null>(null);
	let submitting = $state(false);
	let now = $state(Date.now());

	// `issued` is only set after the page data reloaded with the new code in it, so the code
	// dropping out of `pendingCodes` later means a device claimed it.
	const inPending = $derived(!!issued && pendingCodes.some((c) => c.code === issued!.code));

	const remainingMs = $derived(issued ? Math.max(0, issued.expiresAt - now) : 0);
	const paired = $derived(!!issued && !inPending && remainingMs > 0);
	const expired = $derived(!!issued && !paired && remainingMs === 0);
	const fraction = $derived(issued ? remainingMs / (issued.expiresAt - issued.issuedAt) : 0);
	const remainingLabel = $derived.by(() => {
		const s = Math.ceil(remainingMs / 1000);
		return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
	});

	const pairCommand = $derived(
		issued ? `finderella-storage-gateway pair --hub ${page.url.origin} --code ${issued.code}` : ''
	);
	const connectCommand = 'finderella-storage-gateway connect';

	// Tick the countdown, and refresh the page data every few seconds so a device that
	// claims the code shows up here (and in the list behind the dialog) on its own.
	$effect(() => {
		if (!open || !issued || paired || expired) return;
		const tick = setInterval(() => (now = Date.now()), 1000);
		const refresh = setInterval(() => invalidateAll(), 3000);
		return () => {
			clearInterval(tick);
			clearInterval(refresh);
		};
	});

	function reset() {
		issued = null;
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (!isOpen) reset();
	}}
>
	<Dialog.Content class="sm:max-w-lg">
		{#if !issued}
			<Dialog.Header>
				<Dialog.Title>Pair a device</Dialog.Title>
				<Dialog.Description>
					Any computer or NAS that holds your media can serve it. Name it, then run the one-time
					code on that device.
				</Dialog.Description>
			</Dialog.Header>
			<form
				method="POST"
				action="?/createCode"
				class="flex flex-col gap-6"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						await update();
						submitting = false;
						if (result.type === 'success' && result.data?.code) {
							const data = result.data as { code: string; gatewayName: string; expiresAt: string };
							now = Date.now();
							issued = {
								code: data.code,
								name: data.gatewayName,
								issuedAt: now,
								expiresAt: new Date(data.expiresAt).getTime()
							};
						}
					};
				}}
			>
				<Field.Field>
					<Field.Label for="pair-name">Device name</Field.Label>
					<Input id="pair-name" name="name" placeholder="Living-room NAS" autocomplete="off" />
					<Field.Description>Shown in this list. You can rename it later.</Field.Description>
				</Field.Field>
				<Dialog.Footer>
					<Button type="submit" disabled={submitting}>
						{submitting ? 'Generating…' : 'Generate code'}
					</Button>
				</Dialog.Footer>
			</form>
		{:else}
			<Dialog.Header>
				<Dialog.Title>Pair “{issued.name}”</Dialog.Title>
				<Dialog.Description>
					{#if paired}
						Paired. Start the gateway on the device to bring it online.
					{:else}
						Run this on the device. The code works once.
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			<div class="flex flex-col gap-3">
				<div class="flex items-center gap-3">
					<!-- One tile per character, in two groups of four so it reads aloud easily. -->
					<div
						class={[
							'flex flex-1 items-center justify-center gap-1.5 transition-opacity sm:gap-2',
							(expired || paired) && 'opacity-40'
						]}
						aria-label="Pairing code {issued.code.split('').join(' ')}"
						role="img"
					>
						{#each issued.code.split('') as char, i (i)}
							<span
								class={[
									'grid h-11 w-8 place-items-center rounded-lg border border-border bg-muted font-mono text-xl font-semibold text-foreground shadow-[inset_0_-2px_0_var(--color-border)] sm:h-12 sm:w-9 sm:text-2xl',
									i === 4 && 'ml-2 sm:ml-3'
								]}
							>
								{char}
							</span>
						{/each}
					</div>
					<CopyButton text={issued.code} label="Copy code" />
				</div>

				{#if paired}
					<p class="flex items-center justify-center gap-1.5 text-xs font-medium text-primary">
						<HugeiconsIcon icon={Tick02Icon} class="size-4" /> Code used
					</p>
				{:else if expired}
					<p class="text-center text-xs text-destructive">This code has expired.</p>
				{:else}
					<div class="flex items-center gap-3">
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
							<div
								class="h-full origin-left rounded-full bg-primary transition-transform duration-1000 ease-linear motion-reduce:transition-none"
								style:transform="scaleX({fraction})"
							></div>
						</div>
						<span class="text-xs text-muted-foreground tabular-nums">
							Expires in {remainingLabel}
						</span>
					</div>
				{/if}
			</div>

			<ol class="flex flex-col gap-4 text-sm">
				<li class={['flex flex-col gap-1.5', paired && 'opacity-50']}>
					<span class="text-muted-foreground">1. Pair</span>
					<div class="flex items-start gap-1 rounded-xl bg-muted/60 py-1 pr-1 pl-3">
						<code class="min-w-0 flex-1 py-1.5 font-mono text-xs break-words">{pairCommand}</code>
						<CopyButton text={pairCommand} label="Copy pair command" />
					</div>
				</li>
				<li class="flex flex-col gap-1.5">
					<span class="text-muted-foreground">2. Connect, and leave it running</span>
					<div class="flex items-start gap-1 rounded-xl bg-muted/60 py-1 pr-1 pl-3">
						<code class="min-w-0 flex-1 py-1.5 font-mono text-xs break-words">{connectCommand}</code
						>
						<CopyButton text={connectCommand} label="Copy connect command" />
					</div>
				</li>
			</ol>

			<Dialog.Footer>
				{#if expired}
					<Button type="button" variant="outline" onclick={reset}>New code</Button>
				{/if}
				<Button type="button" onclick={() => (open = false)}>Done</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
