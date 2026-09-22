<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import PasswordInput from '$lib/components/password-input.svelte';

	let { data, form } = $props();

	const joined = $derived(new Date(data.account.createdAt).toLocaleDateString());

	function message(section: string): string | null {
		return form && form.section === section && 'message' in form && form.message
			? form.message
			: null;
	}
	function saved(section: string): boolean {
		return !!form && form.section === section && 'saved' in form && !!form.saved;
	}
</script>

<svelte:head>
	<title>Profile · Settings · Finderella</title>
</svelte:head>

<!-- Profile -->
<Card.Root>
	<Card.Header>
		<Card.Title>Profile</Card.Title>
		<Card.Description>
			<span class="inline-flex flex-wrap items-center gap-2">
				<Badge variant={data.account.isAdmin ? 'default' : 'secondary'}>
					{data.account.isAdmin ? 'Administrator' : 'User'}
				</Badge>
				<span>Member since {joined}</span>
			</span>
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateName" use:enhance>
			<Field.Group>
				<Field.Field data-invalid={message('profile') ? true : undefined}>
					<Field.Label for="name">Display name</Field.Label>
					<Input
						id="name"
						name="name"
						value={data.account.name}
						autocomplete="name"
						aria-invalid={message('profile') ? true : undefined}
						required
					/>
					{#if message('profile')}
						<Field.Error>{message('profile')}</Field.Error>
					{:else if saved('profile')}
						<Field.Description>Name updated.</Field.Description>
					{/if}
				</Field.Field>
				<Field.Field>
					<Button type="submit" variant="secondary" class="w-fit">Save name</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<!-- Email -->
<Card.Root>
	<Card.Header>
		<Card.Title>Email address</Card.Title>
		<Card.Description>You sign in with this address.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/updateEmail" use:enhance>
			<Field.Group>
				<Field.Field data-invalid={message('email') ? true : undefined}>
					<Field.Label for="email">Email</Field.Label>
					<Input
						id="email"
						name="email"
						type="email"
						value={data.account.email}
						autocomplete="email"
						aria-invalid={message('email') ? true : undefined}
						required
					/>
					{#if message('email')}
						<Field.Error>{message('email')}</Field.Error>
					{:else if saved('email')}
						<Field.Description>Email updated.</Field.Description>
					{/if}
				</Field.Field>
				<Field.Field>
					<Button type="submit" variant="secondary" class="w-fit">Save email</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>

<!-- Password -->
<Card.Root>
	<Card.Header>
		<Card.Title>Password</Card.Title>
		<Card.Description>Changing it signs you out everywhere else.</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/changePassword" use:enhance>
			<Field.Group>
				<Field.Field>
					<Field.Label for="current-password">Current password</Field.Label>
					<PasswordInput
						id="current-password"
						name="currentPassword"
						autocomplete="current-password"
						required
					/>
				</Field.Field>
				<Field.Field data-invalid={message('password') ? true : undefined}>
					<Field.Label for="new-password">New password</Field.Label>
					<PasswordInput
						id="new-password"
						name="newPassword"
						autocomplete="new-password"
						minlength={8}
						aria-invalid={message('password') ? true : undefined}
						required
					/>
					{#if message('password')}
						<Field.Error>{message('password')}</Field.Error>
					{:else if saved('password')}
						<Field.Description>Password changed.</Field.Description>
					{:else}
						<Field.Description>At least 8 characters.</Field.Description>
					{/if}
				</Field.Field>
				<Field.Field>
					<Button type="submit" variant="secondary" class="w-fit">Change password</Button>
				</Field.Field>
			</Field.Group>
		</form>
	</Card.Content>
</Card.Root>
