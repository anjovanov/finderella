<script lang="ts">
	import SignupForm from '$lib/components/signup-form.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Create account · Finderella</title>
</svelte:head>

<div class="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
	<p class="text-center text-xl font-bold tracking-[0.25em] text-primary">FINDERELLA</p>
	<SignupForm
		{form}
		firstUser={data.firstUser}
		registrationOpen={data.registrationOpen}
		class="w-full max-w-sm"
	/>
</div>
