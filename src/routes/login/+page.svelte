<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { form } = $props();

	let mode: 'signIn' | 'signUp' = $state('signIn');
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · Finderella</title>
</svelte:head>

<div class="flex min-h-svh items-center justify-center bg-background px-4">
	<div class="w-full max-w-sm">
		<p class="mb-8 text-center text-xl font-bold tracking-[0.25em] text-primary">FINDERELLA</p>

		<div class="rounded-2xl border border-border bg-card p-6 shadow-xl">
			<h1 class="mb-1 text-lg font-semibold">
				{mode === 'signIn' ? 'Welcome back' : 'Create your account'}
			</h1>
			<p class="mb-6 text-sm text-muted-foreground">
				{mode === 'signIn'
					? 'Sign in to keep watching.'
					: 'Set up the first account for this Finderella server.'}
			</p>

			<form
				method="POST"
				action={mode === 'signIn' ? '?/signIn' : '?/signUp'}
				class="flex flex-col gap-3"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update();
					};
				}}
			>
				{#if mode === 'signUp'}
					<Input type="text" name="name" placeholder="Name" required autocomplete="name" />
				{/if}
				<Input type="email" name="email" placeholder="Email" required autocomplete="email" />
				<Input
					type="password"
					name="password"
					placeholder="Password"
					required
					minlength={8}
					autocomplete={mode === 'signIn' ? 'current-password' : 'new-password'}
				/>

				{#if form?.message}
					<p class="text-sm text-destructive">{form.message}</p>
				{/if}

				<Button type="submit" class="mt-2 w-full" disabled={submitting}>
					{mode === 'signIn' ? 'Sign in' : 'Sign up'}
				</Button>
			</form>
		</div>

		<p class="mt-4 text-center text-sm text-muted-foreground">
			{mode === 'signIn' ? 'New here?' : 'Already have an account?'}
			<button
				type="button"
				class="font-medium text-primary hover:underline"
				onclick={() => (mode = mode === 'signIn' ? 'signUp' : 'signIn')}
			>
				{mode === 'signIn' ? 'Create an account' : 'Sign in'}
			</button>
		</p>
	</div>
</div>
