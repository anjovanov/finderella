<script lang="ts">
	import { branding } from '$lib/branding';
	import PageTitle from '$lib/components/page-title.svelte';
	import SignupForm from '$lib/components/signup-form.svelte';

	let { data, form } = $props();
</script>

<PageTitle title="Create account" />

<div class="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
	<div class="flex max-w-full flex-col items-center gap-2 text-center">
		<p class="font-heading text-xl font-bold tracking-[0.25em] break-words text-primary uppercase">
			{branding().appName}
		</p>
		{#if branding().tagline}
			<p class="max-w-sm text-sm text-muted-foreground">{branding().tagline}</p>
		{/if}
	</div>
	<SignupForm
		{form}
		firstUser={data.firstUser}
		registrationOpen={data.registrationOpen}
		class="w-full max-w-sm"
	/>
</div>
