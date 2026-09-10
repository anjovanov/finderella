<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
		FieldError
	} from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import PasswordInput from '$lib/components/password-input.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		form = null,
		registrationOpen = true,
		...restProps
	}: ComponentProps<typeof Card.Root> & {
		form?: { message?: string; email?: string } | null;
		registrationOpen?: boolean;
	} = $props();

	const id = $props.id();
	let submitting = $state(false);
</script>

<Card.Root class="mx-auto w-full max-w-sm" {...restProps}>
	<Card.Header>
		<Card.Title class="text-2xl">Welcome back</Card.Title>
		<Card.Description>Sign in to keep watching.</Card.Description>
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
			<FieldGroup>
				<Field data-invalid={form?.message ? true : undefined}>
					<FieldLabel for="email-{id}">Email</FieldLabel>
					<Input
						id="email-{id}"
						name="email"
						type="email"
						placeholder="you@example.com"
						autocomplete="email"
						value={form?.email ?? ''}
						required
					/>
				</Field>
				<Field data-invalid={form?.message ? true : undefined}>
					<FieldLabel for="password-{id}">Password</FieldLabel>
					<PasswordInput
						id="password-{id}"
						name="password"
						autocomplete="current-password"
						aria-invalid={form?.message ? true : undefined}
						required
					/>
					{#if form?.message}
						<FieldError>{form.message}</FieldError>
					{/if}
				</Field>
				<Field>
					<Button type="submit" class="w-full" disabled={submitting}>
						{submitting ? 'Signing in…' : 'Sign in'}
					</Button>
					{#if registrationOpen}
						<FieldDescription class="text-center">
							New here? <a href={resolve('/register')}>Create an account</a>
						</FieldDescription>
					{/if}
				</Field>
			</FieldGroup>
		</form>
	</Card.Content>
</Card.Root>
