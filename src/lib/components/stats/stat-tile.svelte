<script lang="ts">
	import * as Card from '$lib/components/ui/card';

	let { label, value, hint }: { label: string; value: string; hint?: string } = $props();
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Description>{label}</Card.Description>
		<Card.Title class="text-2xl font-semibold tabular-nums">{value}</Card.Title>
		{#if hint}
			<p class="text-xs text-muted-foreground">{hint}</p>
		{/if}
	</Card.Header>
</Card.Root>
