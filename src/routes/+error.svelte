<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
</script>

<svelte:head>
	<title>{page.status} · Finderella</title>
</svelte:head>

<div class="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
	<span class="text-6xl font-bold tracking-tight text-primary">{page.status}</span>
	<p class="text-lg text-muted-foreground">
		{page.error?.message ?? 'Something went wrong.'}
	</p>
	<Button href={resolve('/')} variant="secondary">Back to home</Button>
</div>
