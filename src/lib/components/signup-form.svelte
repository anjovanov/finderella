<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import PasswordInput from '$lib/components/password-input.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		form = null,
		firstUser = false,
		registrationOpen = true,
		...restProps
	}: ComponentProps<typeof Card.Root> & {
		form?: { message?: string; email?: string } | null;
		/** No account exists yet: this sign-up becomes the administrator. */
		firstUser?: boolean;
		registrationOpen?: boolean;
	} = $props();

	const id = $props.id();
	let submitting = $state(false);
</script>

<Card.Root {...restProps}>
	{#if !registrationOpen}
		<Card.Header>
			<Card.Title>Registration is closed</Card.Title>
			<Card.Description>
				This Finderella server isn't accepting new accounts. Ask an administrator to create one for
				you.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button href={resolve('/login')} variant="outline" class="w-full">Back to sign in</Button>
		</Card.Content>
	{:else}
		<Card.Header>
			<Card.Title>{firstUser ? 'Create the admin account' : 'Create an account'}</Card.Title>
			<Card.Description>
				{#if firstUser}
					This is the first account on this server, so it becomes the administrator.
				{:else}
					Enter your details below to start watching.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						await update();
						// A redirect navigates away; keep the button disabled until then.
						if (result.type !== 'redirect') submitting = false;
					};
				}}
			>
				<Field.Group>
					<Field.Field>
						<Field.Label for="email-{id}">Email</Field.Label>
						<Input
							id="email-{id}"
							name="email"
							type="email"
							placeholder="you@example.com"
							autocomplete="email"
							value={form?.email ?? ''}
							required
						/>
					</Field.Field>
					<Field.Field data-invalid={form?.message ? true : undefined}>
						<Field.Label for="password-{id}">Password</Field.Label>
						<PasswordInput
							id="password-{id}"
							name="password"
							autocomplete="new-password"
							minlength={8}
							aria-invalid={form?.message ? true : undefined}
							required
						/>
						{#if form?.message}
							<Field.Error>{form.message}</Field.Error>
						{:else}
							<Field.Description>Must be at least 8 characters long.</Field.Description>
						{/if}
					</Field.Field>
					<Field.Group>
						<Field.Field>
							<Button type="submit" disabled={submitting}>
								{submitting ? 'Creating account…' : 'Create account'}
							</Button>
							<Field.Description class="px-6 text-center">
								Already have an account? <a href={resolve('/login')}>Sign in</a>
							</Field.Description>
						</Field.Field>
					</Field.Group>
				</Field.Group>
			</form>
		</Card.Content>
	{/if}
</Card.Root>
