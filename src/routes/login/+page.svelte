<script lang="ts">
	import LoginForm from '$lib/components/login-form.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Sign in · Finderella</title>
</svelte:head>

<div class="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-10">
	<p class="text-center text-xl font-bold tracking-[0.25em] text-primary">FINDERELLA</p>
	<LoginForm {form} registrationOpen={data.registrationOpen} />
</div>
