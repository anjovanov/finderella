<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';

	let { data, form } = $props();

	const roleOptions = [
		{ value: 'user', label: 'User' },
		{ value: 'admin', label: 'Admin' }
	];
	let newRole = $state('user');
	const newRoleLabel = $derived(roleOptions.find((r) => r.value === newRole)?.label ?? 'User');

	function formatWhen(iso: string): string {
		return new Date(iso).toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Users · Finderella</title>
</svelte:head>

<div>
	<h1 class="text-2xl font-semibold">Users</h1>
	<p class="text-sm text-muted-foreground">
		Everyone with an account on this server. Administrators can reach this dashboard; users can only
		watch.
	</p>
</div>

{#if form && 'message' in form && form.message}
	<p class="text-sm text-destructive">{form.message}</p>
{/if}

<Card.Root>
	<Card.Header>
		<Card.Title>Accounts</Card.Title>
		<Card.Description
			>{data.users.length} {data.users.length === 1 ? 'account' : 'accounts'}</Card.Description
		>
	</Card.Header>
	<Card.Content class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head>Joined</Table.Head>
					<Table.Head class="text-right">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.users as u (u.id)}
					{@const isMe = u.id === data.me}
					<Table.Row>
						<Table.Cell class="font-medium">
							{u.name}
							{#if isMe}<span class="ml-1 text-xs text-muted-foreground">(you)</span>{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{u.email}</Table.Cell>
						<Table.Cell>
							<Badge variant={u.isAdmin ? 'default' : 'secondary'}
								>{u.isAdmin ? 'Admin' : 'User'}</Badge
							>
						</Table.Cell>
						<Table.Cell>
							{#if u.banned}
								<Badge variant="destructive" title={u.banReason ?? undefined}>Banned</Badge>
							{:else}
								<span class="text-xs text-muted-foreground">Active</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-muted-foreground">{formatWhen(u.createdAt)}</Table.Cell>
						<Table.Cell>
							<div class="flex justify-end gap-1">
								<form method="POST" action="?/setRole" use:enhance>
									<input type="hidden" name="userId" value={u.id} />
									<input type="hidden" name="role" value={u.isAdmin ? 'user' : 'admin'} />
									<Button type="submit" variant="ghost" size="sm" disabled={isMe}>
										{u.isAdmin ? 'Make user' : 'Make admin'}
									</Button>
								</form>
								{#if u.banned}
									<form method="POST" action="?/unban" use:enhance>
										<input type="hidden" name="userId" value={u.id} />
										<Button type="submit" variant="ghost" size="sm">Unban</Button>
									</form>
								{:else}
									<form
										method="POST"
										action="?/ban"
										use:enhance
										onsubmit={(e) => {
											const reason = prompt(
												`Ban ${u.email}? They are signed out everywhere. Reason (optional):`
											);
											if (reason === null) {
												e.preventDefault();
												return;
											}
											const input =
												e.currentTarget.querySelector<HTMLInputElement>('input[name="reason"]');
											if (input) input.value = reason;
										}}
									>
										<input type="hidden" name="userId" value={u.id} />
										<input type="hidden" name="reason" value="" />
										<Button type="submit" variant="ghost" size="sm" disabled={isMe}>Ban</Button>
									</form>
								{/if}
								<form
									method="POST"
									action="?/remove"
									use:enhance
									onsubmit={(e) => {
										if (!confirm(`Delete ${u.email}? Their watch history goes too.`))
											e.preventDefault();
									}}
								>
									<input type="hidden" name="userId" value={u.id} />
									<Button
										type="submit"
										variant="ghost"
										size="sm"
										class="text-destructive"
										disabled={isMe}
									>
										Delete
									</Button>
								</form>
							</div>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Create an account</Card.Title>
		<Card.Description>
			Add someone directly — useful when public registration is switched off.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/createUser" use:enhance>
			<Field.Group>
				<div class="grid gap-4 md:grid-cols-2">
					<Field.Field>
						<Field.Label for="new-name">Name</Field.Label>
						<Input id="new-name" name="name" autocomplete="off" required />
					</Field.Field>
					<Field.Field>
						<Field.Label for="new-email">Email</Field.Label>
						<Input id="new-email" name="email" type="email" autocomplete="off" required />
					</Field.Field>
					<Field.Field>
						<Field.Label for="new-password">Password</Field.Label>
						<Input
							id="new-password"
							name="password"
							type="password"
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
								<Select.Group>
									{#each roleOptions as option (option.value)}
										<Select.Item value={option.value} label={option.label} />
									{/each}
								</Select.Group>
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				<Field.Field>
					<Button type="submit" class="w-fit">Create account</Button>
					{#if form && 'created' in form && form.created}
						<Field.Description>Created {form.created}.</Field.Description>
					{/if}
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
