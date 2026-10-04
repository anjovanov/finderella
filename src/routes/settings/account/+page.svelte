<script lang="ts">
	import PageTitle from '$lib/components/page-title.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckmarkCircle02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import PasswordInput from '$lib/components/password-input.svelte';

	let { data, form } = $props();

	const joined = $derived(new Date(data.account.createdAt).toLocaleDateString());
	const editing = $derived(data.editing);

	// Seeded from the account; Edit, Cancel and a save each re-run the load
	// (the mode is in the URL), which puts them back on the saved values.
	let name = $derived(data.account.name);
	let email = $derived(data.account.email);
	let newPassword = $state('');
	let currentPassword = $state('');
	let saving = $state(false);

	const nameChanged = $derived(name.trim() !== data.account.name);
	const emailChanged = $derived(email.trim().toLowerCase() !== data.account.email.toLowerCase());
	const passwordChanged = $derived(newPassword !== '');
	const needsCurrentPassword = $derived(emailChanged || passwordChanged);
	const dirty = $derived(nameChanged || emailChanged || passwordChanged);

	function clearPasswords() {
		newPassword = '';
		currentPassword = '';
	}

	function errorFor(field: string): string | null {
		return form && 'field' in form && form.field === field ? form.message : null;
	}
	const formError = $derived(form && 'field' in form && form.field === null ? form.message : null);

	const SAVED_LABELS: Record<string, string> = {
		name: 'name',
		email: 'email address',
		password: 'password'
	};
	const savedMessage = $derived.by(() => {
		const labels = data.saved.flatMap((key) => SAVED_LABELS[key] ?? []);
		if (labels.length === 0) return null;
		const list =
			labels.length === 1
				? labels[0]
				: `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
		return `Your ${list} ${labels.length === 1 ? 'was' : 'were'} updated.`;
	});
</script>

<PageTitle title="Account · Settings" />

<Card.Root>
	<Card.Header>
		<Card.Title>Account</Card.Title>
		<Card.Description>
			<span class="inline-flex flex-wrap items-center gap-2">
				<Badge variant={data.account.isAdmin ? 'default' : 'secondary'}>
					{data.account.isAdmin ? 'Administrator' : 'User'}
				</Badge>
				<span>Member since {joined}</span>
			</span>
		</Card.Description>
		{#if !editing}
			<Card.Action>
				<Button
					href="{resolve('/settings/account')}?edit"
					variant="secondary"
					size="sm"
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					onclick={clearPasswords}
				>
					<HugeiconsIcon icon={PencilEdit02Icon} data-icon="inline-start" />
					Edit
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		<!-- autocomplete="off": no restoring stale values on reload (see CLAUDE.md);
		     the password fields keep their own hints for password managers. -->
		<form
			method="POST"
			action="?/save"
			autocomplete="off"
			use:enhance={({ formData }) => {
				// Post only what changed (the action re-checks anyway).
				if (!nameChanged) formData.delete('name');
				if (!emailChanged) formData.delete('email');
				if (!passwordChanged) formData.delete('newPassword');
				if (!needsCurrentPassword) formData.delete('currentPassword');
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'redirect') clearPasswords();
					await update({ reset: false });
				};
			}}
		>
			<!-- Tighter than the Field defaults (gap-7 between fields, gap-2 inside). -->
			<Field.Group class="gap-4">
				<Field.Field class="gap-1.5" data-invalid={errorFor('name') ? true : undefined}>
					<Field.Label for="name">Display name</Field.Label>
					<Input
						id="name"
						name="name"
						bind:value={name}
						disabled={!editing}
						aria-invalid={errorFor('name') ? true : undefined}
						required
					/>
					{#if errorFor('name')}<Field.Error>{errorFor('name')}</Field.Error>{/if}
				</Field.Field>

				<Field.Field class="gap-1.5" data-invalid={errorFor('email') ? true : undefined}>
					<Field.Label for="email">Email address</Field.Label>
					<Input
						id="email"
						name="email"
						type="email"
						bind:value={email}
						disabled={!editing}
						aria-invalid={errorFor('email') ? true : undefined}
						required
					/>
					{#if errorFor('email')}<Field.Error>{errorFor('email')}</Field.Error>{/if}
				</Field.Field>

				<Field.Field class="gap-1.5" data-invalid={errorFor('newPassword') ? true : undefined}>
					{#if editing}
						<Field.Label for="new-password">New password</Field.Label>
						<PasswordInput
							id="new-password"
							name="newPassword"
							autocomplete="new-password"
							minlength={8}
							placeholder="Leave blank to keep your password"
							bind:value={newPassword}
							aria-invalid={errorFor('newPassword') ? true : undefined}
						/>
						{#if errorFor('newPassword')}
							<Field.Error>{errorFor('newPassword')}</Field.Error>
						{:else}
							<Field.Description>
								At least 8 characters. Changing it signs you out everywhere else.
							</Field.Description>
						{/if}
					{:else}
						<Field.Label for="password-locked">Password</Field.Label>
						<Input id="password-locked" type="password" value="••••••••" disabled />
					{/if}
				</Field.Field>

				{#if editing}
					<Field.Field
						class="gap-1.5"
						data-invalid={errorFor('currentPassword') ? true : undefined}
					>
						<Field.Label for="current-password">Current password</Field.Label>
						<PasswordInput
							id="current-password"
							name="currentPassword"
							autocomplete="current-password"
							bind:value={currentPassword}
							required={needsCurrentPassword}
							aria-invalid={errorFor('currentPassword') ? true : undefined}
						/>
						{#if errorFor('currentPassword')}
							<Field.Error>{errorFor('currentPassword')}</Field.Error>
						{:else}
							<Field.Description>Needed to change your email address or password.</Field.Description
							>
						{/if}
					</Field.Field>

					<Field.Field orientation="horizontal" class="justify-end">
						{#if formError}<Field.Error class="mr-auto">{formError}</Field.Error>{/if}
						<Button
							href={resolve('/settings/account')}
							variant="ghost"
							data-sveltekit-replacestate
							data-sveltekit-noscroll
							onclick={clearPasswords}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={saving || !dirty}>Save</Button>
					</Field.Field>
				{:else if savedMessage}
					<p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
						<HugeiconsIcon icon={CheckmarkCircle02Icon} class="size-4 text-primary" />
						{savedMessage}
					</p>
				{/if}
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
