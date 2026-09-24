<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		AlertCircleIcon,
		CheckmarkCircle02Icon,
		Delete02Icon,
		MoreVerticalIcon,
		ShieldUserIcon,
		UserAdd01Icon,
		UserBlock01Icon,
		UserCheck01Icon,
		UserIcon
	} from '@hugeicons/core-free-icons';
	import PasswordInput from '$lib/components/password-input.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import { formatRelative } from '$lib/data/time';
	import { DialogForm } from '$lib/dialog-form.svelte';

	let { data, form } = $props();

	type Account = (typeof data.users)[number];

	const roleOptions = [
		{ value: 'user', label: 'User' },
		{ value: 'admin', label: 'Admin' }
	];

	const create = new DialogForm();
	const ban = new DialogForm<Account>();
	const remove = new DialogForm<Account>();
	let newRole = $state('user');
	const newRoleLabel = $derived(roleOptions.find((r) => r.value === newRole)?.label ?? 'User');

	const admins = $derived(data.users.filter((u) => u.isAdmin).length);
	const banned = $derived(data.users.filter((u) => u.banned).length);

	// Role changes and unbans need no confirmation: one hidden form, pointed at the action
	// and filled in before it submits.
	let quickForm = $state<HTMLFormElement>();
	let quick = $state({ action: '?/setRole', userId: '', role: '' });
	async function runQuick(action: string, userId: string, role = '') {
		quick = { action, userId, role };
		await tick();
		quickForm?.requestSubmit();
	}

	function initials(name: string): string {
		return (
			name
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((part) => part[0]?.toUpperCase() ?? '')
				.join('') || '?'
		);
	}
</script>

<svelte:head>
	<title>Users · Finderella</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Users</h1>
		<p class="text-sm text-muted-foreground">
			Everyone with an account on this server. Administrators can reach this dashboard; users can
			only watch.
		</p>
	</div>
	<Button
		onclick={() => {
			newRole = 'user';
			create.show();
		}}
	>
		<HugeiconsIcon icon={UserAdd01Icon} data-icon="inline-start" />
		Create account
	</Button>
</div>

{#if form && 'message' in form && form.message}
	<Alert.Root variant="destructive">
		<HugeiconsIcon icon={AlertCircleIcon} />
		<Alert.Title>{form.message}</Alert.Title>
	</Alert.Root>
{:else if form && 'created' in form && form.created}
	<Alert.Root>
		<HugeiconsIcon icon={CheckmarkCircle02Icon} class="text-primary" />
		<Alert.Title>Created an account for {form.created}.</Alert.Title>
		<Alert.Description>They can sign in with the password you set.</Alert.Description>
	</Alert.Root>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>Accounts</Card.Title>
		<Card.Description>
			{data.users.length}
			{data.users.length === 1 ? 'account' : 'accounts'} · {admins}
			{admins === 1 ? 'administrator' : 'administrators'}
			{#if banned > 0}· {banned} banned{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>User</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head>Joined</Table.Head>
					<Table.Head class="w-20 text-right">Action</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as u (u.id)}
					{@const isMe = u.id === data.me}
					<Table.Row>
						<Table.Cell>
							<div class="flex min-w-0 items-center gap-3">
								<Avatar.Root class="size-8">
									<Avatar.Fallback class="bg-primary/15 text-xs font-semibold text-primary">
										{initials(u.name)}
									</Avatar.Fallback>
								</Avatar.Root>
								<div class="flex min-w-0 flex-col">
									<span class="truncate font-medium">
										{u.name}
										{#if isMe}<span class="ml-1 text-xs font-normal text-muted-foreground"
												>(you)</span
											>{/if}
									</span>
									<span class="truncate text-xs text-muted-foreground">{u.email}</span>
								</div>
							</div>
						</Table.Cell>
						<Table.Cell>
							<Badge variant={u.isAdmin ? 'default' : 'secondary'}>
								{u.isAdmin ? 'Admin' : 'User'}
							</Badge>
						</Table.Cell>
						<Table.Cell>
							{#if u.banned}
								<Badge variant="destructive" title={u.banReason ?? undefined}>Banned</Badge>
								{#if u.banReason}
									<span class="ml-1 text-xs text-muted-foreground">{u.banReason}</span>
								{/if}
							{:else}
								<span class="text-muted-foreground">Active</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">
							<span title={new Date(u.createdAt).toLocaleString()}>
								{formatRelative(u.createdAt)}
							</span>
						</Table.Cell>
						<Table.Cell class="text-right">
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button {...props} variant="ghost" size="icon-sm" aria-label="Manage {u.name}">
											<HugeiconsIcon icon={MoreVerticalIcon} />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="min-w-52">
									{#if isMe}
										<DropdownMenu.Label class="text-xs font-normal text-muted-foreground">
											You can't change your own account here.
										</DropdownMenu.Label>
									{:else}
										<DropdownMenu.Item
											onSelect={() => runQuick('?/setRole', u.id, u.isAdmin ? 'user' : 'admin')}
										>
											<!-- HugeiconsIcon draws its icon once on mount, hence the {#if}. -->
											{#if u.isAdmin}
												<HugeiconsIcon icon={UserIcon} />
												Make user
											{:else}
												<HugeiconsIcon icon={ShieldUserIcon} />
												Make admin
											{/if}
										</DropdownMenu.Item>
										{#if u.banned}
											<DropdownMenu.Item onSelect={() => runQuick('?/unban', u.id)}>
												<HugeiconsIcon icon={UserCheck01Icon} />
												Unban
											</DropdownMenu.Item>
										{:else}
											<DropdownMenu.Item onSelect={() => ban.show(u)}>
												<HugeiconsIcon icon={UserBlock01Icon} />
												Ban…
											</DropdownMenu.Item>
										{/if}
										<DropdownMenu.Separator />
										<DropdownMenu.Item variant="destructive" onSelect={() => remove.show(u)}>
											<HugeiconsIcon icon={Delete02Icon} />
											Delete account…
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

<form bind:this={quickForm} method="POST" action={quick.action} class="hidden" use:enhance>
	<input type="hidden" name="userId" value={quick.userId} />
	<input type="hidden" name="role" value={quick.role} />
</form>

<!-- Create account -->
<Dialog.Root bind:open={create.open}>
	<Dialog.Content class="sm:max-w-lg">
		<form
			method="POST"
			action="?/createUser"
			class="flex flex-col gap-6"
			use:enhance={create.submit}
		>
			<Dialog.Header>
				<Dialog.Title>Create an account</Dialog.Title>
				<Dialog.Description>
					Add someone directly — useful when public registration is switched off.
				</Dialog.Description>
			</Dialog.Header>
			<Field.Group>
				<Field.Field>
					<Field.Label for="new-name">Name</Field.Label>
					<Input id="new-name" name="name" autocomplete="off" required />
				</Field.Field>
				<Field.Field>
					<Field.Label for="new-email">Email</Field.Label>
					<Input id="new-email" name="email" type="email" autocomplete="off" required />
				</Field.Field>
				<div class="grid gap-4 sm:grid-cols-[1fr_9rem]">
					<Field.Field>
						<Field.Label for="new-password">Password</Field.Label>
						<PasswordInput
							id="new-password"
							name="password"
							autocomplete="new-password"
							minlength={8}
							required
						/>
						<Field.Description>At least 8 characters.</Field.Description>
					</Field.Field>
					<Field.Field>
						<Field.Label for="new-role">Role</Field.Label>
						<Select.Root type="single" name="role" bind:value={newRole}>
							<Select.Trigger id="new-role" class="w-full">{newRoleLabel}</Select.Trigger>
							<Select.Content>
								{#each roleOptions as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				{#if create.error}<Field.Error>{create.error}</Field.Error>{/if}
			</Field.Group>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={create.close}>Cancel</Button>
				<Button type="submit" disabled={create.busy}>
					{create.busy ? 'Creating…' : 'Create account'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Ban -->
<Dialog.Root bind:open={ban.open}>
	<Dialog.Content>
		{#if ban.target}
			<form method="POST" action="?/ban" class="flex flex-col gap-6" use:enhance={ban.submit}>
				<Dialog.Header>
					<Dialog.Title>Ban {ban.target.name}?</Dialog.Title>
					<Dialog.Description>
						They're signed out everywhere and can't sign in until you unban them.
					</Dialog.Description>
				</Dialog.Header>
				<input type="hidden" name="userId" value={ban.target.id} />
				<Field.Field data-invalid={ban.error ? true : undefined}>
					<Field.Label for="ban-reason">Reason (optional)</Field.Label>
					<Input id="ban-reason" name="reason" autocomplete="off" />
					<Field.Description>A note for administrators, shown in this list.</Field.Description>
					{#if ban.error}<Field.Error>{ban.error}</Field.Error>{/if}
				</Field.Field>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={ban.close}>Cancel</Button>
					<Button type="submit" variant="destructive" disabled={ban.busy}>Ban account</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Delete -->
<AlertDialog.Root bind:open={remove.open}>
	<AlertDialog.Content>
		{#if remove.target}
			<AlertDialog.Header>
				<AlertDialog.Title>Delete {remove.target.name}'s account?</AlertDialog.Title>
				<AlertDialog.Description>
					{remove.target.email} loses access, and their watch history goes with the account. This can't
					be undone.
				</AlertDialog.Description>
			</AlertDialog.Header>
			{#if remove.error}<p class="text-sm text-destructive">{remove.error}</p>{/if}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<form method="POST" action="?/remove" use:enhance={remove.submit}>
					<input type="hidden" name="userId" value={remove.target.id} />
					<Button type="submit" variant="destructive" class="w-full" disabled={remove.busy}>
						Delete account
					</Button>
				</form>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
