<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { AlertCircleIcon } from '@hugeicons/core-free-icons';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import SessionDeviceIcon from '$lib/components/session-device-icon.svelte';
	import { sessionDeviceLabel } from '$lib/data/account-sessions';
	import { formatRelative } from '$lib/data/time';
	import { DialogForm } from '$lib/dialog-form.svelte';

	let { data, form } = $props();

	const others = $derived(data.sessions.filter((s) => !s.current).length);

	/** The row whose "Sign out" is in flight. */
	let signingOut = $state<string | null>(null);

	function revokeOne(id: string): SubmitFunction {
		return () => {
			signingOut = id;
			return async ({ update }) => {
				await update();
				signingOut = null;
			};
		};
	}

	const revokeOthers = new DialogForm();
</script>

<svelte:head>
	<title>Devices · Settings · Finderella</title>
</svelte:head>

{#if form && 'message' in form && form.message}
	<Alert.Root variant="destructive">
		<HugeiconsIcon icon={AlertCircleIcon} />
		<Alert.Title>{form.message}</Alert.Title>
	</Alert.Root>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>Devices</Card.Title>
		<Card.Description>
			Where your account is signed in. A device you sign out has to sign in again.
			{#if data.sessionLimit !== null}
				Up to {data.sessionLimit}
				{data.sessionLimit === 1 ? 'device' : 'devices'} can be signed in at once; signing in on another
				signs out the one used longest ago.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<ul class="flex flex-col divide-y divide-border/60">
			{#each data.sessions as s (s.id)}
				<li class="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
					<SessionDeviceIcon session={s} />
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<p class="flex min-w-0 items-center gap-2 font-medium">
							<span class="truncate">{sessionDeviceLabel(s)}</span>
							{#if s.current}<Badge variant="secondary">This device</Badge>{/if}
						</p>
						<p class="text-sm text-muted-foreground">
							{s.current ? 'Active now' : `Last used ${formatRelative(s.lastActiveAt)}`}
						</p>
					</div>
					{#if !s.current}
						<form method="POST" action="?/revoke" use:enhance={revokeOne(s.id)}>
							<input type="hidden" name="sessionId" value={s.id} />
							<Button type="submit" variant="ghost" size="sm" disabled={signingOut === s.id}>
								Sign out
							</Button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		{#if others === 0}
			<p class="mt-4 text-sm text-muted-foreground">You aren't signed in anywhere else.</p>
		{/if}
	</Card.Content>
	<Card.Footer>
		<Button variant="secondary" disabled={others === 0} onclick={() => revokeOthers.show()}>
			Sign out all other devices
		</Button>
	</Card.Footer>
</Card.Root>

<AlertDialog.Root bind:open={revokeOthers.open}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Sign out all other devices?</AlertDialog.Title>
			<AlertDialog.Description>
				{others === 1 ? 'One other device' : `${others} other devices`} will have to sign in again. This
				device stays signed in.
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if revokeOthers.error}<p class="text-sm text-destructive">{revokeOthers.error}</p>{/if}
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form method="POST" action="?/revokeOthers" use:enhance={revokeOthers.submit}>
				<Button type="submit" variant="destructive" class="w-full" disabled={revokeOthers.busy}>
					Sign out others
				</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
